# Owner Questions: Package Generation Protection

Date: 2026-07-24

These questions do not block the strict native protocol or its tests. They
block claiming that the JSON adapter boundary is backed by production-grade
platform anti-rollback guarantees.

## Q-136: Platform protected-storage mechanism

Which Windows and Linux mechanism will own the package-generation protected
state, and can it provide durable integrity, anti-rollback, and atomic
compare-and-swap?

The host now produces and validates exact bounded state bytes, but an ordinary
file is not sufficient. The selected adapter should expose a stable exclusive
slot to the privileged coordinator and must not allow package-store,
browser-originated, or user-profile path input to redirect that slot.

## Q-137: Channel and target migration

How should an authorized update-channel or platform-target change migrate the
protected generation floor?

The native core fails closed when the protected document's channel or target
does not match the active update policy. Provisioning a fresh generation-zero
slot during an ordinary channel switch could re-enable older signed packages,
so a migration needs an authenticated owner policy: retain independent
monotonic floors per scope, explicitly carry a floor forward, or use another
reviewed rule.

## Q-138: Recovery and reset authority

Which privileged component may commit a pending state after interrupted
promotion, and what separately authorized process may reset state after device
loss or protected-storage corruption?

Launcher startup must never commit the highest writable activation marker.
The coordinator needs to distinguish an authenticated promotion/recovery
result from arbitrary package-store contents, perform exact compare-and-swap,
and produce an audit record. Disaster recovery should require explicit owner
authority and must not silently derive a lower floor from writable history.

## Q-139: Product response to rollback detection

What user-visible and fleet-visible response should follow a protected-history
rollback, substitution, or scope mismatch?

The native behavior is fail-closed. Product policy still needs to choose
between a repair workflow, quarantine, support escalation, or managed
reprovisioning, and define which evidence may be included without exposing
private paths or profile data.
