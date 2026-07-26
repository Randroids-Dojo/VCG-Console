# Owner questions: cross-tier camera cabling — 2026-07-25

The plan remains blocked without these inputs. Safe defaults grant no camera
operation, hot-plug/suspend mutation, mechanical pull/bend testing, household
installation or purchase authority.

## QCC-001: passive length-role values

What exact millimetre lengths define short, nominal-routing and maximum-
proposed passive cables on each target? Is the device-supplied cable retained
as one independent role even when its length duplicates another candidate?

Safe default: keep all values null and preserve the supplied cable as its own
identity. Derive candidate lengths from measured qualified placement routes,
not catalog convenience.

## QCC-002: exact cable identities

Which manufacturer, model, revision, connector orientation, conductor gauge,
shielding, certification markings and included adapters define each candidate?

Safe default: require received-item identity and physical length measurement.
Do not treat visually similar or same-listed-length cables as interchangeable.

## QCC-003: target USB topology and power

Which exact host ports, controllers, hubs, adapters, kernel/drivers and power
paths are blocking for ordinary x86, Steam and Pi? May a powered hub qualify?

Safe default: test direct target ports first. A powered hub or adapter is a
separate topology with its own power, latency, recovery and safety evidence.

## QCC-004: electrical and timing gates

What minimum camera voltage, maximum voltage drop, maximum frame-spacing
jitter, reconnect deadline and post-wake usable-capture deadline apply?

Safe default: keep these gates null until the qualified camera's electrical
requirements, measurement uncertainty and user recovery contract justify them.
Freeze them before result data.

## QCC-005: bend radius and retention force

What minimum bend radius applies to each received cable identity, and what
minimum pull force must every connector/retention route survive in each of the
five directions?

Safe default: use the manufacturer's larger documented radius when available;
otherwise block the candidate pending engineering review. Select calibrated
pull forces from household safety needs before physical testing.

## QCC-006: route installation boundary

Which wall/furniture-edge routing products, clips, sleeves, covers or fasteners
are permitted, and may testing alter furniture or finishes?

Safe default: no drilling, adhesive placement or furniture modification.
Require reversible, purpose-rated routing that preserves egress, service
access and child/pet safety under a separately approved installation plan.

## QCC-007: drop and USB-event oracle

Which independent capture/USB instrumentation proves duplicates, drops,
corruption, ordering, CRC/reset/retry/disconnect/reenumeration events and
negotiated mode without trusting only the application summary?

Safe default: bind camera-frame accounting to independent USB/kernel traces and
a nonidentifying optical cadence target. One received frame cannot qualify.

## QCC-008: RF coexistence gates

What maximum Wi-Fi throughput regression and controller-input latency
regression are allowed during the cable radio-coexistence stress state?

Safe default: bind the selected Pi coexistence gates once approved and require
no controller/camera fault. Do not use another band or open enclosure to rescue
the exact routed configuration.

## QCC-009: active USB extension trigger

What exact documented passive failure may open active-extension evaluation, and
which powered/optical/repeater candidates may enter the separate matrix?

Safe default: none until a required passive route fails. Preserve the failed
passive evidence and require explicit owner approval before adding candidates.

## QCC-010: CSI extension fallback

What shared-UVC failure and superseding decision would authorize Pi-only CSI
plus ribbon-extension evaluation?

Safe default: keep CSI disabled under D-043. Cable convenience alone is not a
reason to create a second capture path.

## QCC-011: instruments, operators and schedule

Which calibrated voltage/current, force, length/radius, USB trace, RF/network
and timing instruments; operators; cooldowns; cycle order; invalid reasons and
stop rules apply?

Safe default: bind them before collection, retain every failure/invalid cycle,
and stop for unsafe movement, connector damage, electrical instability,
uncontrolled equipment drift or loss of the independent oracle.
