# Developer-only artifact receipt

Status: native inert receipt implemented; encrypted transport, archive format,
installation, sandbox, launch, logs, rollback, cleanup policy, and target
qualification are not implemented.

## Purpose

D-054 permits an authenticated developer session to send an integrity-hashed
unsigned build without weakening production signing. The build still needs a
strict handoff between volatile session authority and future developer-only
installation.

The native `developer_artifact` module consumes exactly one non-serializable
authorized Push from `developer_pairing`, receives the declared bytes, and
publishes an inert blob. It cannot accept a browser/game request directly and
has no production package or catalog authority.

## Provisioned layout

```text
<developer-artifact-root>/
  .vcg-developer-artifact.lock
  staging/
  ready/
```

The root must be absolute and already exist. `staging` and `ready` must be real
direct child directories, and the lock must be a real direct regular file.
Relative, missing, aliased, symlinked/reparse, or wrong-kind components fail
before mutation.

One ready request has exactly:

```text
ready/<request-id>/
  artifact.bin
  receipt.json
```

No other ready file is accepted. Request and deployment IDs remain bounded
safe opaque identifiers; they cannot be paths.

## Authorization handoff

The store accepts only `AuthorizedDeveloperOperation` with the Push variant.
That unforgeable-by-data object is created only after:

1. exact protected workstation trust;
2. a fresh volatile developer-mode epoch;
3. an exact Ed25519 possession challenge; and
4. an unused bounded operation request ID.

The object is consumed at receipt admission. The canonical receipt retains
only:

- schema version;
- request ID;
- key-derived workstation ID;
- session ordinal;
- deployment ID;
- artifact SHA-256; and
- artifact byte length.

There is no path, IP address, username, profile identity, package authority,
command, argument, environment, URL, credential, secret, arbitrary method, or
free text.

## Receipt and publication

One nonblocking store lock serializes cooperating mutations and reads.
Publication:

1. rejects any unrecovered staging state;
2. rejects a request ID already present in staging or ready;
3. caps ready request directories at 1,024;
4. creates, synchronizes, and re-canonicalizes one exact direct staging
   directory;
5. writes and synchronizes the canonical receipt;
6. reads at most the declared byte length plus one;
7. requires the exact nonzero length, up to the admission layer's 8 GiB
   ceiling;
8. calculates SHA-256 while writing and requires the exact authorized digest;
9. synchronizes the inert artifact and transaction directory;
10. atomically renames the complete transaction into `ready`; and
11. synchronizes the staging and ready parents where the platform exposes
    directory synchronization.

Short, long, changed, or unreadable sources never publish. Their partial
transaction remains in `staging`, blocks later publication, and requires
explicit recovery.

## Recovery

Developer sessions never survive reboot, so an interrupted partial receipt
cannot resume under an old session capability. `recover_incomplete`:

- takes the same nonblocking store lock;
- enumerates at most 1,024 direct staging directories;
- requires every directory name to be a safe request ID;
- permits only partial `receipt.json` and/or `artifact.bin` regular files;
- refuses links/reparse entries, nested directories, foreign files, unsafe
  names, and excessive state; and
- removes only the fully prevalidated direct staging directories.

Ready artifacts are never removed by recovery.

## Verification before reuse

`load_ready` does not trust the publication name or prior verification. It:

- canonicalizes the request directory as an exact direct child;
- requires exactly the receipt and artifact files;
- bounds, parses, validates, and byte-compares canonical receipt JSON;
- binds the receipt request ID to the requested directory;
- requires the exact regular-file length;
- completely rehashes the retained open artifact handle; and
- returns that handle rewound to byte zero.

This prevents ordinary stale metadata or post-publication byte changes from
silently becoming verified input. It does not prove descriptor-to-execution
immutability after the handle leaves this module.

## Automated evidence

Eight Rust tests cover:

- exact receipt, publication, retained-handle read, and reload;
- non-Push denial before mutation;
- short, long, and changed sources plus explicit recovery;
- durable cross-session request replay refusal;
- artifact, receipt, and extra-file tamper rejection;
- nonblocking operation-lock contention;
- absolute/preprovisioned/wrong-kind store boundaries; and
- recovery refusal for foreign state plus exact incomplete cleanup.

Focused tests, crate formatting, and strict Clippy pass.

## Remaining boundary

This is inert receipt, not developer deployment. I-102 still requires:

- the reviewed mutually authenticated encrypted receiver;
- active-session cancellation during a slow or disconnected receive;
- target-protected keys and monotonic trust state;
- durable authenticated transfer retry semantics chosen under DL-009;
- a selected inert archive format and hostile parser;
- capacity reservation and real developer namespace quota;
- malware/content review policy where required;
- verified extraction and immutable artifact handoff;
- separate developer install generations, activation, launch, logs, restart,
  rollback, retention, removal, and save policy;
- runtime sandbox and family/production catalog separation;
- bounded audit UI and controller-only recovery; and
- hostile-LAN, same-account writer, reboot, disk-full, corruption, and sudden
  power-loss evidence on ARM64 and x86-64 Linux.

