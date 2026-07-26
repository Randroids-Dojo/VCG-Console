# Owner questions: native diagnostic store integration

Date: 2026-07-24

The Rust store now proves a bounded closed-code persistence boundary without
selecting product retention or export policy. Q-148 through Q-150 and DR-001,
DR-002, and DR-009 remain active.

## Q-246: privileged owner, source authentication, and boot provenance

Which privileged production process owns the diagnostic store, how does it
authenticate each native producer, and what exact nonidentifying platform
value supplies the positive boot epoch on Raspberry Pi OS and SteamOS?

Safe default: one host-owned service outside browser, game, profile-vault, and
package writable identities owns the store. Same-process adapters receive
move-only producer leases directly. Cross-process producers use a fixed
authenticated local IPC endpoint with operating-system peer credentials and a
closed producer-to-service identity map; never accept a caller-supplied
producer string. Derive the boot epoch from a host-owned monotonic boot record
or qualified platform boot identity, not wall time, hardware serial, network
identifier, or browser value. Treat missing diagnostics as degraded
observability only: it must not block boot, Home/Back, local play, cleanup,
rollback, save commit, profile deletion, or power recovery.

Before wiring, decide whether the store owner is the existing native host or a
separate least-privilege service, name the exact OS identities and socket
permissions on both targets, and define who can issue review, clear, and
one-shot export authority. Q-149 still selects the destination and support
workflow; Q-150 still selects any additional public version or time-quality
fields.
