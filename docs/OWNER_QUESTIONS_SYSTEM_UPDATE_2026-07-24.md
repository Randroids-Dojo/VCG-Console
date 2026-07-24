# Owner Questions: Raspberry Pi System Updates

These decisions are intentionally deferred while the software-only A/B state primitive advances. No answer is required for the current implementation.

## 1. Update trust and channel policy

Which release channels exist, which offline root authorizes each online signing role, and what operator ceremony governs rotation, emergency revocation, and recovery?

Safe default: ship one stable production channel; keep the root offline; use a separately scoped online image-signing key; require threshold-authorized root metadata for rotation/revocation; reject expired, unknown-target, and non-advancing metadata; and make offline recovery independently verifiable. Do not treat the writable local journal as the protected anti-rollback anchor.

Current reversible primitive: D-154 accepts a bounded threshold-signed root policy, requires exact next-generation old-and-new-threshold rotation, scopes non-reused delegated keys to one channel/artifact/target, checks expiration against caller-supplied trusted time, and revokes omitted role keys. D-156/D-157 persist and replay the accepted chain before launcher package admission. D-152's public system-image path requires delegated authority before parsing, retains the completely hashed source handle, and issues sealed journal authority only after an adapter-owned inactive-slot read-back stream matches. Production threshold counts, signer custody, secure time, protected high-water provenance, repository metadata, reader provenance, and physical recovery remain undecided.

This remains the owner/security decision tracked by Q-069 and I-112/I-141.

## 2. Qualified attempt and health-window policy

How many candidate boots and how much elapsed time should the production Raspberry Pi receive before automatic rollback?

Safe default: make the values release-policy metadata within the implementation bounds, begin qualification with two attempts, and never exceed the selected 60-second cold-boot experience gate without truthful recovery UI. Any explicit unhealthy result rolls back immediately; retries are for interruption before a trustworthy result, not for repeatedly ignoring a deterministic failed health check.

The exact values should be selected from measured cold boots, camera/controller discovery, network-offline behavior, and power-loss campaigns rather than preference. The network gate must not require WAN reachability: a healthy network service that truthfully reports intentional offline state must satisfy D-034. Likewise, decide whether an absent camera or controller is allowed at ordinary boot; the gate should measure whether the owning service can represent the selected policy, not accidentally turn peripheral presence into system health.

## 3. Raspberry Pi boot-control implementation

Which qualified boot-control mechanism will atomically consume a pending attempt and select A or B on the exact Raspberry Pi image: firmware `tryboot`, U-Boot environment, RAUC-compatible boot state, or another reviewed adapter?

Safe default: choose only after a disposable-card abuse campaign proves no torn state can make both slots unbootable, every candidate boot consumes its counter before transfer, and automatic fallback works without household intervention. Keep the Rust journal as policy/evidence state; do not claim it alone controls firmware boot selection.

## 4. System/data migration compatibility

Which changes to writable data are allowed during a candidate system boot, and how is backward readability guaranteed if that candidate rolls back?

Safe default: require expand-only, backward-readable migrations during the health window; defer destructive cleanup until the new release has remained healthy through a separately qualified soak; version every persistent domain independently; and fail the candidate before mutation if compatibility is unknown. Never place game saves or player identity data inside either replaceable system slot.
