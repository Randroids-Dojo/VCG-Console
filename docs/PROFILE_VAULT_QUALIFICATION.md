# Console-bound profile-vault qualification

Research snapshot: 2026-07-24

Status: common vault design selected; neither reference target is qualified.
I-187 remains active. No native vault, platform key adapter, protected-state
adapter, partition, mount, or factory-reset executor is implemented by this
document.

Authority: D-047, D-050, D-083, D-084, D-085, D-089, I-072, I-184, I-186,
and I-187.

## Outcome

Use a broker-owned, versioned encrypted object store under the fixed
`profiles/` data namespace. Protect one random console vault key with a
platform adapter, use a separate random key for each profile, and bind the
latest vault generation and complete canonical manifest digest to independently
protected monotonic state. Games, the browser launcher, diagnostics, update
images, recovery tooling, and ordinary package processes receive neither vault
files nor decryption authority.

The selected record suite for qualification is:

- a 256-bit console vault key and independent 256-bit profile keys generated
  by the operating-system CSPRNG on the target console;
- HKDF-SHA-256 with fixed, versioned domain labels for subkey separation;
- AES-256-GCM-SIV, as specified by RFC 8452, with a fresh random 96-bit nonce
  for every key wrap and record encryption;
- SHA-256 only for non-secret content commitments, evidence bindings, and
  manifest addressing; and
- closed, bounded, canonical headers authenticated as AEAD associated data.

AES-GCM-SIV is selected because interruption, rollback, and concurrency make
perfect nonce accounting harder than it first appears. Its misuse resistance
limits the damage of an accidental nonce repeat, although the implementation
must still generate a fresh random nonce and enforce usage limits. It is not a
license to reuse nonces deliberately. Production must use one reviewed,
maintained implementation with constant-time tag verification and test vectors;
hand-written cryptography is forbidden.

This is application-level envelope encryption, not merely an encrypted
filesystem. LUKS2 encryption may be added around writable storage as
defence-in-depth, but it cannot replace this design because an unlocked block
device does not isolate records from games or other processes, cannot provide
per-profile cryptographic deletion, and does not by itself bind deletion state
against rollback.

## Claims and limits

When every qualification gate in this document passes, the design is intended
to establish:

- removing or cloning the microSD/NVMe storage does not disclose profile
  plaintext or unlock it on another console;
- a valid signed A/B update or automatic rollback does not silently lose or
  export the key;
- profile deletion removes the only live wrapped profile key and advances a
  rollback-protected tombstone;
- factory reset and unrecoverable platform-key loss destroy the only console
  vault key and require explicit profile recreation;
- no plaintext fallback exists when hardware, policy, state, or ciphertext is
  missing, stale, substituted, or malformed; and
- portraits, calibration values, and future matching features stay outside
  saves, logs, diagnostics, recovery images, packages, system slots, and
  network paths.

The design does not claim:

- protection from a compromised kernel or a process that can control the
  authorized broker while the vault is open;
- that a TPM, OTP secret, Secure Boot switch, or encrypted filesystem exists
  merely because a vendor platform could support one;
- physical anti-tamper protection against invasive attacks on a bare board;
- recoverability after console loss, key loss, storage loss, destructive
  reflash, or factory reset;
- that body-profile matching is safe or enabled; or
- that current prototype display names already use this store.

An automatically unlocked vault protects data at rest. It is not
authentication and must never be described as proof that the person in front
of the camera is the profile owner.

## Data and key hierarchy

```text
platform key protector
  |
  +-- unseals console vault key (CVK; random 256 bits)
        |
        +-- wraps profile key A (random 256 bits)
        |     +-- encrypts profile metadata record
        |     +-- encrypts separate portrait record
        |     +-- encrypts calibration record
        |     +-- encrypts future matching template only after I-184 gates
        |
        +-- wraps profile key B ...

protected monotonic state
  |
  +-- binds vault ID + sequence + complete canonical manifest SHA-256
```

The platform protector seals or wraps only the CVK. It must not derive the CVK
from a serial number, MAC address, machine ID, public device identifier,
profile ID, user name, password, recovery phrase, or update signing key.
Provisioning creates the CVK on the console and never exports it.

Each opaque profile ID has one independently random profile key. The manifest
contains only the encrypted profile-key envelope, opaque object identifiers,
record type, ciphertext length class, generation, content digest, and
transaction state. A profile key is never stored persistently outside its
authenticated CVK-wrapped envelope.

Deleting a profile publishes a new manifest without the wrapped profile key,
adds a protected tombstone for the opaque profile ID and prior generation,
commits that exact manifest to protected state, and only then removes obsolete
ciphertext. Residual flash cells may retain ciphertext, but no current key
path can decrypt it. The profile registry is launch authority, not deletion
authority; removal from that registry cannot stand in for this transaction.

Destroying the CVK makes every remaining profile envelope unrecoverable. Game
saves are stored separately under `games/` and are not decrypted or deleted by
the vault operation. Under D-089 they remain local and unrecoverable after
storage loss, but profile deletion must deliberately make preserved progress
unassigned rather than silently attach it to a recreated identity.

## Record format requirements

The implementation must freeze a separate closed schema before accepting real
household data. At minimum, every authenticated record header binds:

- schema and algorithm-suite versions;
- a random vault identifier;
- the opaque profile ID;
- a random opaque record identifier;
- closed record type;
- profile generation and record generation;
- exact plaintext and ciphertext lengths or approved padding class;
- random salt and nonce;
- previous logical record commitment when the operation replaces a record;
  and
- a fixed domain label distinguishing profile-key wraps from each data type.

Display names, portrait pixels, calibration values, and matching measurements
exist only inside ciphertext. Portraits remain separate records so the
launcher can receive a broker-approved render handle without receiving
calibration or matching material. Ciphertext files use random names and
bounded padding classes so a directory listing does not expose names or exact
portrait dimensions. Profile count, coarse size class, and mutation timing
remain observable to a storage attacker and are accepted only as documented
metadata leakage.

AEAD failure, unknown suite or schema, duplicate object, inconsistent length,
noncanonical header, unsafe path, missing record, digest mismatch, or
generation mismatch fails the entire operation without releasing partial
plaintext. Parsers must authenticate before interpreting sensitive payloads
and must cap manifest, record, profile, and total-vault sizes before
allocation.

## Broker boundary

One native profile broker is the sole process allowed to request CVK unseal,
hold plaintext profile keys, or open ciphertext. It exposes closed,
caller-specific operations rather than a generic read/write or filesystem
interface.

| Caller | Allowed result | Explicitly unavailable |
|---|---|---|
| Launcher | Display name, readiness flags, separately approved portrait render handle | Record bytes, keys, body measurements, matching template, arbitrary field lookup |
| Tracker/calibration service | One profile-scoped calibration projection or matching operation during an authorized visible flow | Portrait pixels, household enumeration, key material, unrestricted historical samples |
| Native/local-web/hosted/retro game | Confirmed opaque session player ID and separately granted gameplay calibration output | Vault path, mount, portrait, display name unless separately projected, matching data |
| Diagnostics | Aggregate health, version, counts in approved coarse buckets, path-free error code | IDs, names, values, images, ciphertext, key handles, snippets |
| Update/recovery/factory service | Health probe or destructive whole-vault reset through a separate authenticated operation | CVK export, profile decryption, backup, migration |

The service runs under a dedicated identity with no interactive login. Target
configuration must deny games and the launcher access to the vault root,
hardware key device, protected-state slot, broker control socket, `/dev/vcio`,
TPM resource manager, process memory, `/proc` inspection, and core dumps.
Memory containing plaintext or keys must be locked where supported, marked
non-dumpable, zeroized on release, excluded from hibernation, and never sent to
swap. Allocation or locking failure for key material is fatal to vault
availability, not permission to continue insecurely.

Developer and maintenance modes have broader code and operator authority.
They must stop the broker and make the vault unavailable before admitting
unsigned code, a general shell, debugger attachment, or raw device access.
Returning to family mode requires a clean reboot through the qualified boot
chain. This narrows accidental exposure; it does not defend against a
previously compromised kernel.

## Crash and rollback transaction

The writable store uses immutable, create-new objects and a hash-linked,
bounded sequence of canonical manifest snapshots. One host-owned nonblocking
lock serializes every vault mutation.

For one mutation:

1. Load platform protected state and replay the complete manifest history.
2. Require exact equality of vault ID, sequence, and manifest digest.
3. Validate the caller, operation, profile generation, quotas, and all input
   before mutation.
4. Create and synchronize every new ciphertext object without replacement.
5. Publish and synchronize one exact next manifest record that references only
   complete objects and the prior manifest digest.
6. Return the exact next protected state.
7. Atomically compare-and-swap platform state from the supplied prior value to
   that exact next value.
8. Only after the protected commit, acknowledge success and remove obsolete
   ciphertext or completed temporary state.

No read or later mutation may use a manifest ahead of protected state. An
authenticated exact-operation retry may recover one published record only if
reconstructing the operation from its protected prior snapshot produces the
same canonical bytes. A different retry, more than one unexplained record,
history behind protected state, or same-sequence digest substitution fails
closed.

This mirrors the existing root, package-generation, and system-update
protected-state ordering. The implementation should share one reviewed
platform adapter and lock-order policy rather than create independent,
deadlock-prone hardware writers. The vault has its own namespace and state
slot: update rollback must not roll vault state back, and a vault write must
not advance update authority.

Protected state contains no secret, but it must provide integrity,
anti-rollback, exclusive slot identity, durable atomic compare-and-swap, and a
qualified write budget. An authenticated file beside the vault is not enough:
a cloned card would carry both the old vault and its matching file.

## A/B update integration

Both the active and retained healthy system slots must be authorized to unseal
the same CVK during an ordinary signed update or automatic rollback. The
authorization must not simply bind to one exact current kernel measurement
and strand the prior slot.

On a TPM2/UEFI lane, the candidate is a signed PCR policy or another reviewed
`PolicyAuthorize` construction that admits only release-authorized measured
boot states. systemd documents signed PCR policies specifically for allowing
new kernel and initrd measurements without resealing every LUKS secret.
Direct binding to volatile PCR values is too brittle unless qualification
proves the exact update sequence.

The update sequence must:

1. verify and write the inactive image through the existing D-152 path;
2. verify that the candidate boot measurement is covered by an authorized
   vault-unseal policy while retaining authorization for the healthy slot;
3. boot only after the existing protected update-attempt claim commits;
4. run a broker health probe that decrypts a synthetic sentinel, never a real
   profile, as part of storage health;
5. confirm the candidate only after all existing D-050 gates pass; and
6. retire an old unseal policy only after that slot is no longer the required
   automatic rollback target and the retirement transaction is itself
   interruption-safe.

Firmware, Secure Boot database, bootloader, kernel command-line, initramfs,
and TPM policy updates each need the same two-version test. Supplying a
recovery key or weakening PCR binding to rescue a failed update is prohibited;
the product has deliberately selected data loss over a portable vault-recovery
secret.

## Platform capability inventory

### Raspberry Pi 5

Confirmed from current Raspberry Pi primary documentation:

- Pi 5 secure boot verifies a customer-signed `boot.img`; on BCM2712 the
  BootROM also requires customer counter-signing of the second-stage firmware.
  Enabling the customer key hash in OTP is irreversible.
- The signed `boot.img` can contain the kernel and initramfs used to open an
  encrypted filesystem, but firmware does not itself provide full-disk
  encryption.
- BCM2712 supplies OTP rows intended for a device-specific private key.
  Raspberry Pi explicitly states that the platform has no hardware-protected
  key store and that the value is available to authorized `/dev/vcio`
  callers; supervisor code can access the hardware.
- Raspberry Pi's provisioner supports Pi 5 secure boot and encrypted
  filesystems with device-unique keys, but remains under active development.
- The published Pi 5 product specification lists CPU cryptographic
  extensions, microSD, PCIe, USB, and the 40-pin header; it does not identify
  an integrated TPM.

Result: the built-in secure-boot plus OTP construction is a candidate for the
narrow removed-card threat. It is not a TPM, does not isolate the key from a
compromised authorized kernel, and does not supply the mutable protected
monotonic state required to reject an old but internally valid card snapshot.
It is therefore not yet a complete I-187 production adapter.

Two Pi qualification branches remain:

| Branch | Hardware | Potential claim | Blocking evidence |
|---|---|---|---|
| Pi-OTP | Pi 5 secure boot plus device-private-key service | Automatic unlock and storage-card confidentiality against another device | Exact locked-key/HMAC interface and firmware pin; `/dev/vcio` ACL and kernel boundary; A/B signed-image flow; protected monotonic state from another qualified mechanism; power-loss and key-destruction evidence |
| Pi-TPM | Exact SPI TPM 2.0 module integrated inside the enclosure | TPM-sealed CVK, measured/authorized boot, and protected NV state | Exact vendor/part/revision/certification, Linux driver and TPM version, 40-pin/AI-HAT electrical coexistence, bus/enclosure tamper posture, NV atomicity/endurance, signed A/B policy, BOM/thermal/service impact |

Infineon's active/preferred OPTIGA TPM SLB 9672 FW16 is the first silicon
candidate for the Pi-TPM branch. Its current manufacturer material specifies
an SPI interface, TPM 2.0 revision 1.59, 24 PCRs, 51 KiB of NV memory, and
Common Criteria EAL4+ and FIPS 140-2 Level 2 certifications. It is a
surface-mount IC, not a qualified Raspberry Pi module. Infineon also documents
an SLB 9672 Raspberry Pi SPI TPM HAT evaluation board, revision 3.2, with a
40-pin header and support for FW15.xx and FW16.xx. That board is the first
desk-integration candidate, not a production selection: current orderability,
exact populated silicon/firmware, AI HAT mechanical and electrical
coexistence, enclosure fit, device-tree binding, kernel driver,
manufacturing/provisioning flow, and assembled-product threat review remain
unproven. Raspberry Pi's current overlay catalog names an
Infineon `tpm-slb9670` SPI overlay and an SLB9673 I2C overlay, but does not
explicitly name SLB9672. Similarity is not compatibility evidence: the exact
Pi 5 kernel, overlay, reset/interrupt wiring, probe output, command set, event
log, suspend, reboot, and repeated-power-cut behavior must pass. Chip or
evaluation-board certification must not be presented as certification of the
VCG console.

The AI HAT occupies the exposed PCIe connector, so an NVMe TPM assumption is
invalid for the selected lower-cost lane. An SPI module may coexist through
the 40-pin header, but only the exact assembled BOM and enclosure can prove
that. Customer OTP rows, serial numbers, MAC addresses, or the public
machine-ID hash are not substitute secrets.

### Steam Machine and ordinary x86-64 Linux

Valve's current Steam Machine product page publishes CPU, GPU, RAM, storage,
network, and I/O specifications but does not publish a TPM model, TPM version,
Secure Boot support state, measured-boot event-log contract, or custom-key
enrollment policy. Valve support documents how Steam can report TPM 2.0 and
Secure Boot on a PC; that generic detection is not evidence that the Steam
Machine exposes a usable TPM or that stock SteamOS preserves custom
enrollment across updates.

Valve's recovery documentation provides Steam Machine UEFI boot instructions
and warns that many non-Deck devices require Secure Boot to be disabled for
SteamOS re-imaging. That does not establish the exact Steam Machine policy.
Stock recovery also offers destructive re-image and content-preserving repair,
both of which must be tested against VCG's stricter device-only loss and
exclusion contract.

The ordinary x86 candidate is:

- TPM 2.0 with SHA-256 PCR bank, resource-manager support, usable sealed
  objects, event log, and qualified NV storage;
- UEFI Secure Boot under an exact owner-controlled or vendor-supported trust
  policy;
- a measured UKI/initramfs or equivalent complete boot chain;
- a signed PCR policy permitting only the current healthy and authorized
  candidate images; and
- an OS update path that preserves the broker, sealed object, policy
  signatures, and protected-state transaction.

systemd's `systemd-cryptenroll`, `systemd-measure`, and `systemd-pcrlock`
document relevant TPM2 building blocks. `systemd-pcrlock` is explicitly
experimental, so it is evidence of an available mechanism to test, not an
automatic production selection. The exact delivered Steam Machine must be
inventoried before this branch can pass.

## Fail-closed behavior

| Condition | Required behavior |
|---|---|
| No platform key device or service | Vault unavailable; offer explicit recreation/reset only after diagnosis |
| Unseal policy mismatch after update | Candidate health fails and A/B rollback runs; do not prompt for or synthesize a recovery key |
| CVK missing or destroyed | Declare device-only profiles unrecoverable, preserve saves as unassigned, recreate a fresh empty vault only through explicit reset |
| Protected state ahead of manifest | Treat as storage rollback/loss; no state lowering or old-vault adoption |
| Manifest ahead of protected state | Permit only exact authenticated one-step recovery; otherwise quarantine the vault |
| Same generation with another digest | Treat as substitution; no repair from writable data |
| AEAD/tag/record failure | Release no plaintext; quarantine the affected vault and retain path-free diagnostic code |
| Low space | Reject before mutation while preserving the prior committed manifest and recovery reserve |
| Power loss during mutation | Recover to the prior committed state or one exact pending protected commit |
| Developer/maintenance mode | Broker stopped and key not unsealed; family mode resumes only after qualified reboot |
| Crash dump, swap, hibernation, log, or diagnostic attempt | Sensitive source is excluded; positive canary control must make the evidence test fail |
| Factory reset | Destroy protector state/CVK first, then erase vault files; interruption cannot yield a bootable console that silently reuses the old vault |

No path copies a sealed object to a replacement console and calls that
recovery. A ciphertext clone may be useful for an adversarial test, but it is
never a supported backup.

## Qualification matrix

Every result records exact board/system revision, firmware, bootloader, OS,
kernel, broker build, cryptographic library, TPM or key-service identity,
storage model, filesystem, configuration digests, and evidence-tool versions.
Real household data is forbidden; use synthetic canaries and synthetic
portraits.

| Area | Required experiment | Passing evidence |
|---|---|---|
| Inventory | Enumerate secure-boot state, key device, TPM algorithms/version, event log, NV capabilities, driver, permissions, and firmware ownership | Reproducible signed report tied to exact hardware; unknown or software-emulated TPM fails |
| Provisioning | Generate CVK on device, seal once, reboot, inspect all build/provision logs and media | CVK never appears outside broker memory/protector; seeded canary scanner passes with positive control |
| Other-device clone | Clone the complete writable medium and boot/mount it on another same-model console and generic Linux host | No record decrypts; no secret is recoverable from image, header, logs, or provisioning artifacts |
| Card removal | Remove storage after clean shutdown and after abrupt power loss | Only bounded ciphertext/metadata leakage; no plaintext or key |
| Boot substitution | Modify boot image, kernel, initramfs, command line, policy signature, Secure Boot setting, or event log | Boot or unseal fails before profile plaintext |
| Old signed image | Boot every retained/revoked signed system generation | Only explicitly authorized A/B rollback image unseals; revoked/obsolete image fails |
| A/B update | Interrupt before/after image write, policy publication, attempt claim, candidate boot, health, confirmation, and policy retirement | Prior healthy slot remains usable; candidate never needs plaintext fallback; no split authority |
| Firmware update | Apply accepted and rejected EEPROM/UEFI/TPM/Secure Boot updates | Accepted two-version window survives; rejected state cannot unseal; loss behavior is explicit |
| Manifest rollback | Restore old complete vault snapshots before and after profile update/delete | Protected state rejects old sequence/digest and does not revive deleted data |
| Same-generation substitution | Replace one manifest/ciphertext with valid material from another console or test vault | Digest, vault ID, device protector, or AEAD binding rejects it |
| Profile deletion | Delete each record type, interrupt every transaction phase, restore old card snapshot | Profile key becomes unreachable only after exact protected commit; no automatic reassociation |
| Factory reset | Interrupt before/after key destruction and each filesystem cleanup stage | Old vault never becomes usable again; reset is idempotent; profiles are visibly recreated |
| Protector loss/clear | Clear TPM/OTP adapter, replace motherboard, corrupt sealed object, exceed policy | Hard loss flow; no recovery phrase, default key, state lowering, or plaintext copy |
| Broker ACL | Attack socket/filesystem/device from launcher, hosted/local web, native, Godot, Libretro, diagnostics, and update identities | Every ungranted operation fails; games receive only approved projection |
| Running-root boundary | Inspect memory and devices as service users, developer mode, and root; attach debugger where policy allows | Ordinary identities cannot read; root limitation is demonstrated and documented rather than misclaimed |
| Memory lifecycle | Force broker crash, OOM, restart, suspend/hibernate attempt, swap pressure, and core collection | No key/plaintext in swap, hibernation, core, journal, crash service, or support artifacts |
| Logging/diagnostics | Inject synthetic canaries into every sensitive field and trigger every error | I-186 materializers and positive controls prove exclusion; output remains path-free and non-sensitive |
| Filesystem faults | Full disk, read-only remount, I/O error, corrupt directory, link substitution, concurrent writer, lost fsync | Prior committed state or fail-closed quarantine; never partial plaintext or guessed repair |
| Power loss | Repeated cuts during each create, sync, publish, protected CAS, acknowledge, delete, and reset step | Deterministic prior/pending recovery and no silent rollback over the pre-registered cycle count |
| Performance | Cold boot, unseal, list, portrait render, calibration read/write, update, delete, reset under full console workload | Pre-registered p50/p95/p99 and memory/CPU/I/O budgets pass on both reference lanes |
| Endurance | Measure TPM/secure-state writes and microSD writes under accelerated profile churn | Projected lifetime and protected NV limits exceed the product gate with stated margin |
| Long offline | Boot and update rollback without network or trusted wall clock | Existing authorized state works offline; network loss never causes a weaker unlock path |
| Repair/re-image | Run every supported Valve/Pi repair and reflash path | Device-only profile loss is disclosed; no vault enters image, repair bundle, preserved-content copy, or network |

I-187 closes only when the complete matrix passes on the exact Raspberry Pi
assembly and delivered Steam Machine. Ordinary x86 evidence may validate the
common broker and TPM adapter but cannot substitute for the delivered Steam
Machine firmware and SteamOS update path.

## Evidence that still must be produced

- Exact Raspberry Pi key-protector branch and, if used, TPM part/revision and
  enclosure integration.
- Exact delivered Steam Machine TPM, UEFI, Secure Boot, event-log, SteamOS,
  recovery, and update inventory.
- Reviewed cryptographic implementation and frozen bounded on-disk schemas.
- Shared protected-state adapter with measured atomicity, write endurance,
  reset authority, and lock ordering.
- Broker IPC, service identity, sandbox, no-dump/no-swap configuration, and
  hostile-caller tests.
- Crash-recoverable vault journal, deletion tombstones, profile-registry
  integration, unassigned-save transition, and factory reset.
- Full I-186 producer-specific canary campaign over updates, repair, support,
  reflash, clone, and reset.
- Target power-loss, storage-fault, update/rollback, performance, and long-run
  evidence.
- Security review of algorithm usage, key lifecycle, metadata leakage, root
  limitation, and residual risk before any family beta.

Until then, launcher copy must continue to describe durable encrypted profiles
as planned rather than implemented. Automatic body-profile matching remains
disabled.

## Primary sources

- [Raspberry Pi secure-boot chain and disk-encryption
  boundary](https://github.com/raspberrypi/usbboot/blob/master/docs/secure-boot.md)
- [Raspberry Pi hardware documentation: device-specific private
  key](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#device-specific-private-key)
- [Raspberry Pi secure-boot and encrypted-filesystem
  provisioner](https://github.com/raspberrypi/rpi-sb-provisioner)
- [Raspberry Pi 5 product
  brief](https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-product-brief.pdf)
- [Infineon OPTIGA TPM SLB 9672 FW16 product
  details](https://www.infineon.com/part/OPTIGA-TPM-SLB-9672-FW16)
- [Infineon SLB 9672 Raspberry Pi SPI TPM HAT evaluation-board
  brief](https://www.infineon.com/assets/row/public/documents/30/49/infineon-optiga-tpm-slb-9672-fw15-datasheet-en.pdf?fileId=8ac78c8c850f4bee01852eeaeb200bc8)
- [Raspberry Pi firmware device-tree overlay
  catalog](https://github.com/raspberrypi/firmware/blob/master/boot/overlays/README)
- [systemd TPM2/LUKS enrollment and signed PCR
  policies](https://www.freedesktop.org/software/systemd/man/latest/systemd-cryptenroll.html)
- [systemd PCR 11 measurement and policy
  signatures](https://www.freedesktop.org/software/systemd/man/latest/systemd-measure.html)
- [systemd protected PCR policy tool and experimental
  status](https://www.freedesktop.org/software/systemd/man/latest/systemd-pcrlock.html)
- [Valve Steam Machine product
  specifications](https://store.steampowered.com/hardware/steammachine)
- [Valve Secure Boot and TPM 2.0 support
  guidance](https://help.steampowered.com/en/faqs/view/7451-A8FE-3867-6A2E)
- [Valve SteamOS installation and repair
  guidance](https://help.steampowered.com/en/faqs/view/65B4-2AA3-5F37-4227)
- [RFC 5869: HKDF](https://www.rfc-editor.org/rfc/rfc5869)
- [RFC 8452: AES-GCM-SIV](https://www.rfc-editor.org/rfc/rfc8452)
