# Owner questions: Bluetooth controller qualification

Date: 2026-07-25

Status: non-blocking questions retained for I-117 execution

The blocked plan is complete without these answers. No controller purchase,
pairing, bond mutation, radio fault or battery session should begin until the
applicable answers are recorded before results.

## QBT-001: received sample roster

Which exact received first-party, second-vendor and generic ambiguous Bluetooth
controllers and hardware/firmware revisions fill Q-227? Which two make the
simultaneous cross-vendor pair, and how many physical samples per revision are
required?

Use salted campaign aliases in released evidence; do not publish Bluetooth
addresses, stable serials or discoverable names.

## QBT-002: pairing and recovery UX

Which exact BlueZ pairing-agent policy, controller-accessible confirmation,
passkey/PIN handling and physical fallback are approved? What is the visible
flow for discovery timeout, rejection, ambiguous mapping, forgotten bonds and
an unavailable Bluetooth service?

## QBT-003: bond and assignment policy

Where may bonds be stored, which privileged service can create/revoke them, and
what proves revocation after forget/reset? What is the approved player
assignment/reassignment ceremony without using a durable device identifier as
authority?

## QBT-004: battery sources and behavior

For each sample, which OS/controller source is authoritative and how fresh must
it be? What physical protocol establishes low and critical conditions, which
warnings/actions are approved, and how should charging, unavailable and stale
states appear?

## QBT-005: numeric gates and fault authority

Before results, what are the maximum acceptable p95 pairing, cold-boot
reconnect, fault reconnect, low-battery input and warning latencies; minimum
low-battery usable duration; and maximum disconnect ratio? Who authorizes radio
loss, Bluetooth-service restart, controller power loss, bond deletion and
battery discharge under the counterbalanced schedule?

The five-second warm reconnect boundary and zero-failure identity, action,
assignment, reserved-control, recovery and disclosure gates already apply.
