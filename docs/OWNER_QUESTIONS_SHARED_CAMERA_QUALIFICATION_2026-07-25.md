# Owner questions — I-177 shared-camera qualification

Date: 2026-07-25

Status: non-blocking for plan validation; blocking for purchase, capture,
participant work, target execution, qualification, selection, or BOM changes

## Q1 — Purchase destination and authority

Which destination postal code and tax jurisdiction should be used for the
Brio `960-001105` delivered quote, and who may authorize an order?

Provide a destination-aware item price, shipping, tax, return terms, seller,
stock state, timestamp, and immutable quote digest. Do not treat the existing
item-page price as a delivered quote or purchase approval.

## Q2 — Candidate set and selection timing

Is the existing Brio candidate the only device to qualify first, or must one or
more exact alternatives run through the same 40-cell campaign before
selection?

Freeze candidate identities and the comparison/selection rule before any
result. An alternative's lower price or wider advertised field of view cannot
substitute for received-device, privacy, optical, latency, reliability, and
packaging evidence.

## Q3 — Required target tuples

Provide the exact ordinary x86 Linux, SteamOS, and Pi 5 plus AI HAT hardware,
operating-system image, kernel, firmware, camera driver, browser/tracker
runtime, USB topology, power/performance state, and packaging protocol.

If SteamOS hardware is unavailable, decide whether that target remains
blocking, uses a specifically approved proxy without claiming Steam Machine
qualification, or moves to a later superseding campaign. Also decide whether
Windows fallback needs an additional required row.

## Q4 — Received identity

Which receipt, packaging labels, merchandise revision, USB vendor/product and
descriptor inventory, firmware, serial treatment, cable, and port evidence
bind the received unit?

Use digests or opaque evidence IDs for any serial-bearing material; do not
publish stable device identifiers in the result envelope.

## Q5 — Numeric optical and capture gates

Freeze the exact minimum horizontal/vertical field of view, head/feet and zone-
edge margins, maximum distortion/crop/floor error, minimum low-light level,
maximum exposure and blur, sustained duration, capture/inference FPS floor,
drop ceiling, USB/resource ceilings, attempt count, and invalid-attempt rule.

The genuine-mode proof must reject duplicated-frame inflation and bind the
actual negotiated width, height, frame cadence, pixel format, controls, and
captured/dropped frame ledger.

## Q6 — Timestamp authority

Which exposure timestamp source and proof are valid for each exact
camera/mode/driver/target combination, and how is uncertainty mapped to the
game-API receipt clock?

Capture arrival, browser callback, inference, animation, and display
timestamps remain diagnostic sub-intervals and cannot prove the 120 ms gate.

## Q7 — Reconnect and suspend repetitions

Freeze the hot-plug cycle count, suspend/resume cycle count, disconnect
detection deadline, safe tracking-loss behavior, reconnect deadline,
recalibration trigger, post-recovery identity oracle, and failed-cycle policy.

One successful reconnect or wake cannot qualify a consumer lifecycle.

## Q8 — Microphone disablement

Which completed I-179 result must be bound for each target, including ordinary
x86 Linux if it is not covered by the current Raspberry Pi OS, SteamOS, and
Windows plan?

Muted or silent PCM is not denial. Every device/audio-stack/browser/package/
update/recovery layer must return no audio buffer, and any admin diagnostic
path requires separate explicit policy.

## Q9 — Physical privacy and packaging

Define the shutter occlusion oracle, indicator visibility conditions and
capture-path coverage, ordinary-fastener replacement procedure, standard
connector rule, cable strain-relief tests, anti-tip/stability gates, Pi
fixed-angle geometry, airflow/RF clearance, and external-mount placements.

The indicator must cover every authorized capture path; a UI icon cannot
substitute for a physical device indication.

## Q10 — Participant and frame handling

Approve the exact room/placement protocol, adult and school-age-child
participant/guardian consent, independent optical and action truth, volatile
frame-analysis boundary, skeleton/numeric result schema, evidence retention,
and deletion audit.

The current plan forbids raw-frame retention and network egress. Any retained
room imagery would require a separate privacy, legal, security, encryption,
access, incident, consent, and deletion decision before capture begins.

## Q11 — Selection and failure policy

Must every one of the 40 cells pass, and does a failure reject only one target,
the received unit, the merchandise revision, or the entire candidate family?
Define permitted retest only for a proven harness defect and require a fresh
frozen plan after device, driver, image, control, room, or threshold changes.

The safe current rule is no aggregate rescue, no selection, and no BOM change
while any required cell is failed, incomplete, unknown, or not run.
