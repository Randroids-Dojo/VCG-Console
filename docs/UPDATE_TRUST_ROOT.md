# Update Trust Root and Delegated Roles

Status: bounded root/role verification and system-image/package integration implemented; protected persistence, secure time, repository metadata, operator ceremony, and recovery drills remain open.

## Purpose

`native/vcg-host/src/update_trust.rs` defines a small TUF-inspired trust boundary for VCG updates. It is intentionally not described as a TUF or Uptane client.

The primitive provides:

- out-of-band bootstrap anchors with a configurable Ed25519 signature threshold;
- a bounded, closed root document verified before parsing;
- exact-generation root rotation signed by both the current and candidate root thresholds;
- distinct root and delegated keys with no key ID or public-key reuse across roles;
- exact channel, artifact family, and hardware-target roles;
- root expiration checked against caller-supplied trusted Unix time;
- fixed cross-protocol domains for system images, installed catalogs, and package releases;
- threshold authorization of exact bounded artifact bytes before their semantic parser runs; and
- immediate role-key revocation by omission from the next authenticated root generation.

The public system-image, installed-catalog, and package-release loaders now require this delegated role authority. Their previous direct single-key loaders exist only in test builds.

## Root document v1

Root metadata is limited to 64 KiB and uses closed JSON. Example:

```json
{
  "schemaVersion": 1,
  "generation": 8,
  "expiresUnixSeconds": 1814400000,
  "rootThreshold": 2,
  "rootKeys": [
    {
      "keyId": "root-a",
      "publicKey": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    },
    {
      "keyId": "root-b",
      "publicKey": "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
    }
  ],
  "roles": [
    {
      "channel": "stable",
      "artifact": "system-image",
      "target": "raspberry-pi-5",
      "threshold": 1,
      "keys": [
        {
          "keyId": "system-stable-2026",
          "publicKey": "1111111111111111111111111111111111111111111111111111111111111111"
        }
      ]
    }
  ]
}
```

All key IDs, channels, and targets are bounded safe ASCII identifiers. Public keys and signatures are canonical lowercase hexadecimal. The policy allows at most 16 root keys, 32 roles, 16 keys per role, and 32 detached signatures for one document.

## Serialized bootstrap and signature inputs

The launcher accepts root policy only through three bounded, absolute, normalized, non-symlink regular files:

- root metadata, limited to 64 KiB;
- a closed detached-signature bundle, limited to 32 KiB; and
- a closed out-of-band anchor document, limited to 16 KiB.

Signature bundles use:

```json
{
  "schemaVersion": 1,
  "signatures": [
    {
      "keyId": "catalog-stable-2026",
      "signature": "128-lowercase-hex-characters"
    }
  ]
}
```

Anchor documents use:

```json
{
  "schemaVersion": 1,
  "threshold": 2,
  "anchors": [
    {
      "keyId": "root-a",
      "publicKey": "64-lowercase-hex-characters"
    }
  ]
}
```

The anchor file is not self-authenticating. It must come from verified read-only image or hardware provisioning. The CLI representation makes the boundary deterministic for integration tests; it does not make caller-selected paths, generation floors, channels, or time trustworthy.

Root signatures cover:

```text
VCG-UPDATE-TRUST-ROOT-V1\0 || exact root bytes
```

Artifact roles reuse the existing exact domains and payload limits:

| Artifact | Signed domain | Maximum payload |
|---|---|---:|
| System image manifest | `VCG-SYSTEM-IMAGE-MANIFEST-V1\0` | 64 KiB |
| Installed package catalog | `VCG-INSTALLED-CATALOG-V1\0` | 1 MiB |
| Package release descriptor | `VCG-PACKAGE-RELEASE-V1\0` | 64 KiB |

A valid signature from one role cannot authorize another protocol. Because keys cannot be reused across roles in one accepted root, a delegated private key is also structurally scoped to one channel/artifact/target tuple.

## Bootstrap

`TrustedUpdateRoot::bootstrap` receives exact root bytes, a bounded detached-signature set, host-provisioned anchors, an anchor threshold, a persisted minimum root generation, and trusted time.

The operation:

1. rejects an empty or oversized root payload;
2. verifies the exact bytes under the provisioned anchor threshold;
3. only then parses the closed JSON document;
4. validates all bounds, keys, roles, uniqueness, and thresholds;
5. rejects a generation below the persisted floor;
6. rejects an expired root; and
7. requires the document to meet its own root threshold.

The anchor threshold and actual anchors remain image/provisioning inputs. This repository does not select their production count or custody ceremony.

## Rotation and revocation

`TrustedUpdateRoot::rotate` accepts only `current generation + 1`. Candidate bytes must first meet the current root threshold before parsing, then meet the candidate document's own root threshold. This permits complete root-key replacement without allowing an untrusted candidate to choose its own authority.

Removing a delegated key from the next root generation revokes it for subsequent role verification. Removing or replacing root keys requires the same dual-threshold transition. Skipped versions, rollback, an old-only signature set, a new-only signature set, malformed metadata, and expired candidates fail closed.

This is only the in-memory verification rule. Production still needs crash-recoverable storage of every accepted root generation, protected high-water state, retention of the prior trusted root during interruption, and a physical recovery path.

## Time and offline behavior

Every bootstrap and artifact authorization receives one caller-supplied trusted Unix time. At or after `expiresUnixSeconds`, role authorization stops. Root rotation may use the prior root's keys even after that prior root expires, but the candidate itself must be current; this preserves a path out of expiration without accepting artifacts under stale metadata.

The primitive does not establish trustworthy time. A writable wall clock controlled by an attacker is not sufficient. Target qualification must select a secure clock or sufficiently recent authenticated time and define behavior after long offline periods.

No network is required to verify already-present root metadata, signatures, or artifacts. However, this primitive has no timestamp or snapshot role, so it cannot detect every repository freeze, fast-forward, mix-and-match, or malicious-mirror behavior. Root expiration only bounds indefinite reuse of the current delegated policy.

## Artifact integration

`VerifiedSystemImageRelease::load_with_update_role`:

1. bounds the exact manifest;
2. requires a current `system-image` role for the exact channel and privileged target;
3. verifies the role threshold over the exact domain-separated bytes;
4. only then parses the image manifest; and
5. retains root generation, channel, target, artifact family, and signing key IDs as `VerifiedUpdateRole`.

The manifest parser still independently checks its internal target, generation, hash, length, and format. Role authority does not select an A/B slot or prove a partition write.

`VerifiedPackageRelease::load_with_update_role` and `TrustedPackageCatalog::load_with_update_role` apply the same signature-before-parse rule for exact package-release and installed-catalog roles. Both retain `VerifiedUpdateRole` evidence. `PackageGenerationStore` carries one `TrustedUpdatePolicy` snapshot through descriptor intake, catalog verification before inert publication, health/promotion, recovery, and active-generation reload. Catalog and release signature files are bounded key-ID-labeled bundles, so thresholds larger than one remain representable.

The launcher no longer accepts `--catalog-public-key`. Catalog-backed startup requires `--update-root`, `--update-root-signatures`, `--update-root-anchors`, `--update-root-min-generation`, `--update-channel`, and `--trusted-unix-seconds`. These values are host integration inputs. The current binary does not establish their protected provenance, and a long-running host must not reuse a stale trusted-time snapshot for later update admission.

## Offline recovery drill design

The focused suite models a separately keyed `recovery/system-image/target`
role and proves a stable-channel key cannot authorize it. A real operator drill
still requires all of the following:

1. Start from a clean, independently verified computer and recovery-writing tool.
2. Obtain immutable bootstrap anchors from a second trusted source and record their hashes and custodians.
3. Read the console's protected root-generation floor without lowering or deleting it.
4. Verify every exact root generation from that floor through the recovery media's current generation; never jump directly to the latest root.
5. Verify the recovery-channel system-image manifest under its separate threshold, then verify the complete image length and hash.
6. Write only the operator-selected replacement card or inactive recovery target, synchronize it, and read back the complete signed image bytes.
7. Boot without network, validate target identity and all required health gates, and prove injected candidate failure still selects a known-good image.
8. Apply the separately selected writable-data policy. Never imply that reflashing preserves local saves, profiles, retro content, or packages unless the physical procedure proves it.
9. Record tool versions, generations, hashes, media identity, elapsed time, failures, and custody of all offline material.

I-113 owns the cross-platform writer and blank-card procedure. I-202 owns the
repeated physical power-removal campaign. The automated role-separation test is
not physical recovery proof.

## Automated evidence

Seventeen focused root-policy tests cover:

- anchor-threshold verification before root JSON parsing;
- separate bootstrap-anchor and candidate-root thresholds;
- exact next-generation dual-threshold rotation;
- old-only/new-only signature denial;
- skipped and rolled-back root denial;
- persisted generation floor and expiration;
- exact channel/artifact/target role lookup;
- delegated threshold authorization;
- cross-protocol signature denial;
- independent recovery-channel authority;
- revocation by authenticated key omission;
- one exact artifact bundle remaining valid across a dual-signed old/new role-key cutover;
- denial when a bootstrap or immediately current root key is reassigned to an artifact role during acceptance;
- duplicate role, key ID, and public-key reuse denial;
- unknown fields, unsafe identifiers, noncanonical encoding, invalid thresholds, and bounded payloads;
- strict bounded serialized anchor/signature documents; and
- policy rejection for unsafe channels and roots expired at the supplied time.

Three artifact integration tests prove delegated role verification occurs before system-image, catalog, and release parsing and records accepted authority. A generation-store adversarial test proves changed descriptor bytes and a package-release signer presented as a catalog signer fail closed.

## Explicitly unproven

- Root anchors are not pinned in a verified read-only image or hardware root.
- Accepted root generations and their high-water mark are not persisted by this module.
- Trusted time, clock rollback resistance, long-offline UX, and expiry policy are undefined.
- Root/signature acquisition, consistent filenames, timestamp/snapshot metadata, mirrors, download-rate checks, and repository recovery are absent.
- Threshold counts, signer custody, rotation cadence, emergency revocation, quorum loss, and offline ceremony are owner/security decisions.
- Atomic root/package cutover is absent; routine catalog-key rotation must prove a newer dual-authorized active generation across both roots, while emergency revocation needs explicit unavailable-package and recovery behavior.
- The artifact generation floors remain in their existing package/system state and are not authenticated by protected monotonic hardware.
- No compromised-key, expired-device, lost-quorum, factory-recovery, or removable-media drill has run.

## Standards basis

The shape follows a deliberately small subset of current primary guidance:

- [The Update Framework specification](https://theupdateframework.github.io/specification/v1.0.35/) defines offline root authority, role thresholds, expiration, rollback/freeze checks, and root rotation signed by both old and new thresholds.
- [Uptane Standard 2.0.0](https://uptane.org/docs/2.0.0/standard/uptane-standard) applies root/targets/snapshot/timestamp separation, secure time, exact hardware/image metadata, and full verification to software images.
- [RFC 8032](https://datatracker.ietf.org/doc/html/rfc8032) specifies Ed25519.

Production should adopt a maintained conformant implementation if the complete repository workflow is required. This local primitive must not grow into an undocumented partial reimplementation while claiming equivalent protections.
