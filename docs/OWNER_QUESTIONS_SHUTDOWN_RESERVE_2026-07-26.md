# Owner questions: shutdown reserve comparison — 2026-07-26

These questions block physical execution and the I-032 value decision. They do
not block improving software/storage resilience, completing I-202 fixture and
oracle work, or validating the strict zero-result comparison contract.

## RES-001: D-109 reopening trigger

What exact repeated-interruption failure count, campaign window, and failure
class are sufficient to reopen D-109 rather than fix software or move from
microSD to the documented USB 3 SSD fallback?

Safe default: a first failure remains a preserved product failure and diagnosis
input. Do not select reserve hardware or skip the SSD fallback without a
reviewed trigger and superseding owner decision.

## RES-002: electrical event scope

Which abrupt loss, brownout, short-dropout, undervoltage, oscillating-reconnect,
restoration, and low-reserve waveforms block prototype and final acceptance?

Safe default: retain the common five event profiles plus all five reserve-fault
profiles. Uncontrolled or unmeasured events are harness-invalid, never passes.

## RES-003: permitted candidate topologies

Is I-032 limited to a certified external AC UPS and an isolated pre-engineered
Pi shutdown-reserve module, or may custom cells, battery HATs, capacitor banks,
GPIO sensing, load switches, and enclosure-integrated wiring be considered?

Safe default: no custom energy-storage assembly. Exact safe candidate classes,
isolation, protection, wiring, connectors, fire/thermal review, and household
placement must be approved before candidate selection or operation.

## RES-004: shutdown handshake and hold-up gate

What event-detection latency, shutdown completion time, minimum rail voltage,
fresh/end-of-life hold-up margin, and authenticated shutdown signal define a
pass under peak complete-system load?

Safe default: freeze worst-case values before operation and require independent
rail and state evidence. Advertised runtime or a logged shutdown request is not
completion.

## RES-005: false triggers and availability

How many false shutdowns, missed events, reconnect loops, nuisance restarts, or
boots with insufficient reserve are acceptable, and what user recovery latency
is tolerable?

Safe default: zero unsafe or missed required transitions. Keep false-trigger
and availability limits open rather than choosing them after observing results.

## RES-006: units, lots, cycles, and environments

How many received units and independent lots, valid trials per scenario cell,
charge/discharge cycles, aging states, temperatures, load states, and soak time
are required?

Safe default: every alternative retains at least 200 valid I-202 trials, but
that floor alone does not establish lifecycle or field reliability.

## RES-007: degraded and end-of-life behavior

What minimum service life, retained capacity, recharge time, maintenance
interval, state-of-health accuracy, replacement warning, and fail-safe behavior
are required when the reserve is depleted, disconnected, aged, hot, cold, or
faulty?

Safe default: degraded hardware must not create a false bootability or
committed-state claim, and no candidate may hide its first adverse evidence.

## RES-008: complete cost and physical burden

What delivered-cost delta, lifetime energy/replacement cost, assembled volume,
mass, cable/enclosure burden, installation time, and service time are acceptable
inside the D-111 lower-cost product?

Safe default: count the complete delivered and lifecycle burden. The 65,000-cent
cap is necessary but does not by itself make backup power worthwhile.

## RES-009: value model and decision horizon

Over what household service horizon should failure avoidance, lost uncommitted
progress, downtime, maintenance, standby energy, supply continuity, safety,
space, and service complexity be ranked? What weights and tie-breaks apply?

Safe default: keep weights, ranking, tie-break, expiry, and retest rules null
until owner review; do not let an after-the-fact score select a candidate.

## RES-010: relationship to qualified microSD and SSD results

Must both software/storage alternatives be fully qualified before reserve
comparison, and does a passing microSD incumbent end I-032 or merely raise the
required net-value threshold for optional reserve hardware?

Safe default: require complete, non-rescuing results for the incumbent and SSD
fallback. A passing incumbent preserves D-109; optional reserve still needs a
separate pre-registered value case and owner decision.

## RES-011: publication, expiry, and review

Who independently reviews electrical safety, result derivation, lifecycle and
cost evidence? How long may a candidate result survive revision, cell,
firmware, supplier, or production changes?

Safe default: approval is exact-identity and evidence-version scoped, expires
under a frozen policy, and never generalizes to a product family or silent
substitute.

## RES-012: authority

Who may purchase or return candidates, contact vendors, wire or charge energy
storage, mutate firmware, operate the destructive fixture, select a reserve,
change the BOM, publish a claim, or supersede D-109?

Safe default: none of those actions is authorized by the comparison plan. A
positive result informs a separate explicit owner decision.
