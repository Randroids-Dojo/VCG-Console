# Developer LAN trust and session authority

Status: native admission foundation implemented; encrypted LAN transport,
listener, target key protection, deployment storage, and product UI are not
implemented or qualified.

## Purpose

Developer deployment is a deliberate exception to the signed production
package path. D-052 and D-053 permit a previously paired workstation to push
integrity-bound unsigned development artifacts only while a visibly enabled
console developer session is active. Family mode, reboot, service restart,
expiry, or explicit exit must leave no usable session.

The native `developer_pairing` module establishes the authority that a future
transport must consume. It does not open a socket or choose a cryptographic
channel.

## Authority sequence

```text
reserved local confirmation
          |
          v
publish next canonical trust registry
          |
          v
commit exact generation + registry SHA-256
          |
          v
start volatile developer-mode epoch
          |
          v
trusted workstation signs one exact challenge
          |
          v
closed push / launch / logs / restart / rollback admission
```

No later step repairs or bypasses a missing earlier step. In particular:

- writable registry bytes do not create trust;
- a remembered workstation does not create a live session;
- a valid signature does not enable developer mode;
- an authenticated session does not grant production-package authority; and
- an admitted operation does not install, execute, or read anything by itself.

## Persistent workstation trust

The canonical v1 registry is bounded to 16 KiB and 32 workstations. Each entry
contains only:

- a deterministic `workstation-<32 lowercase hex>` ID derived from the first
  128 bits of SHA-256 over the public key; and
- one canonical lowercase 32-byte Ed25519 public key.

Entries are strictly sorted and unique. The document contains no workstation
name, username, IP address, MAC address, path, URL, certificate, secret,
permission, profile identity, package name, or revocation reason.

Generation zero is one exact empty document. Every pairing or revocation:

1. starts from a registry that already matches protected platform state;
2. increments the generation exactly once;
3. binds the prior canonical registry SHA-256;
4. returns the exact next canonical bytes and protected state;
5. requires the privileged adapter to publish the bytes first; and
6. withholds all use until the platform atomically commits the returned
   generation and registry SHA-256.

Loading rejects a writable generation behind protected state, a digest
substitution at the same generation, a jump beyond one generation, and an
invalid predecessor. A writable registry exactly one generation ahead is
reported only as `ProtectionCommitRequired`; it cannot authenticate a
workstation. Startup must never auto-commit that state. A privileged recovery
ceremony must prove the interrupted pairing or revocation operation or discard
the unpublished bytes.

The protected-state JSON is an adapter boundary. Saving it beside the registry
is explicitly insufficient because the same writer could roll back both.

## Volatile developer session

`DeveloperSessionAuthority` can be constructed only at the privileged
integration boundary after fresh local developer-mode confirmation. It binds:

- a nonzero 256-bit operating-system-random epoch that is never persisted;
- one monotonic deadline no more than 15 minutes in the future;
- one active trusted workstation;
- monotonic session ordinals; and
- at most 1,024 used operation request IDs.

The workstation receives an exact challenge containing:

- the `vcg-developer-session-v1` domain;
- protocol version 1;
- session ordinal;
- volatile epoch;
- a nonzero 256-bit challenge nonce; and
- a monotonic expiry no more than 60 seconds away and never beyond the
  developer-mode deadline.

Only an exact Ed25519 signature from the currently protected workstation key
opens a non-serializable capability. Wrong-key, substituted, stale, expired,
unknown-workstation, duplicate, and concurrent challenge attempts fail closed.
Closing or expiring the authority clears the challenge, live session, and
request replay set. Reboot cannot restore any of them from disk.

The signature proves key possession for this console-generated volatile
challenge. It does not provide confidentiality, channel binding, peer-address
identity, forward secrecy, replay protection outside this process, or proof
that a real reserved control produced the developer-mode confirmation. Those
remain transport and platform-adapter responsibilities.

## Closed operation vocabulary

An authenticated session may request only:

| Operation | Bound fields |
|---|---|
| Push | Safe deployment ID, canonical artifact SHA-256, nonzero size up to 8 GiB |
| Launch | Safe deployment ID |
| Read logs | Safe deployment ID |
| Restart | Safe deployment ID |
| Rollback | Safe deployment ID |

Every operation also carries a unique safe request ID. The admission object has
no path, command line, argument, environment variable, URL, network
destination, credential, profile identity, production package ID, arbitrary
method name, arbitrary JSON, or free-text log field.

The vocabulary is authorization input for future developer-only storage and
process services. It does not:

- choose or parse an archive format;
- select extraction rules or a sandbox;
- write a package generation;
- launch a child;
- read or redact logs;
- choose rollback retention;
- grant retro-import authority; or
- enter the family or production catalog.

The separate `developer_artifact` module now consumes only an authorized Push,
receives the complete declared bytes, verifies exact length and SHA-256, and
atomically publishes one inert developer-only blob plus a canonical path-free
receipt. It revalidates the complete blob through a retained handle before
reuse and explicitly discards only safe incomplete staging state after a lost
session. See `DEVELOPER_ARTIFACT_RECEIPT.md`. It does not implement any of the
install, execution, log, restart, rollback, or removal operations above.

## Required integration behavior

A conforming future service must:

- source local enable/pair/revoke/exit only from authenticated reserved native
  input, never browser state or game input;
- use operating-system randomness for every epoch and challenge;
- place trust mutation and protected-state commit behind a separate privileged
  operation;
- close the listener before developer-mode authority is destroyed;
- bind the encrypted transport peer to the exact challenged workstation key;
- re-check current protected trust before each new session;
- place received artifacts in a visually distinct developer-only namespace;
- hash the complete bounded artifact before the admitted operation can consume
  it;
- make request replay and partial-receipt cleanup durable where retries cross
  process restart;
- keep audit fields closed, redacted, bounded, and local; and
- preserve ordinary family use when pairing, discovery, LAN, or the workstation
  is absent.

## Automated evidence

Eleven Rust tests cover:

- the sole canonical empty registry and rejection of unknown/noncanonical
  fields;
- two-phase pairing and exact protected activation;
- malformed key-derived identities plus workstation-count and byte bounds;
- rollback, substitution, unexplained generation, and predecessor rejection;
- two-phase revocation;
- strict canonical and bounded protected-state parsing;
- exact trusted-key signature admission;
- unknown, wrong-key, substituted, and expired challenges;
- close, expiry, invalid randomness, and excessive lifetime;
- immediate capability invalidation before any trust mutation is published;
  and
- the closed operation vocabulary, unsafe IDs/digests/sizes, and request
  replay.

Focused tests, the complete native suite, crate formatting, strict Clippy,
workspace typechecking, production build, and package-bound launcher/OCR-A
evidence validators pass. The root JavaScript gate remains intentionally
sensitive to any concurrent source/evidence tranche and must be rerun after
that shared state settles.

## Remaining qualification

I-102 remains active. Closure still requires the choices in
`OWNER_QUESTIONS_DEVELOPER_LAN_2026-07-24.md`, a reviewed authenticated
encrypted transport, target-protected console and workstation keys, real
listener lifecycle, reserved-input integration, pairing and revocation UI,
developer archive/extraction/install/launch/log/rollback/removal services,
capacity and retention policy, audit retention,
hostile-LAN and stolen-key tests, interruption/reboot tests, target ARM64 and
x86-64 Linux evidence, and measured controller-only time to first launch.
