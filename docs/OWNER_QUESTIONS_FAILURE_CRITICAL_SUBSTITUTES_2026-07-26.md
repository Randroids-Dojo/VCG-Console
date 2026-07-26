# Owner Questions: Failure-Critical Substitutes

These questions block candidate selection, vendor approval, purchase, physical
operation, qualification, publication, and BOM substitution. They do not block
validation of the I-031 zero-result umbrella.

## SUB-001: target and role ownership

Do both required tiers use all 12 functional roles, and who owns the primary
baseline plus substitute decision for each target-role cell?

Safe default: keep Raspberry Pi 5 and ordinary x86 Linux required, SteamOS
optional/non-rescuing, and all roles mandatory at a functional level even when
several are integrated into a finished appliance.

## SUB-002: qualified primary prerequisite

Must a primary part pass its own complete qualification before its substitute
campaign can produce a relative-equivalence result?

Safe default: yes. A substitute may be screened earlier, but it cannot qualify
against an unqualified or moving primary. Freeze the primary target, image,
firmware, workload, gates, and failure record first.

## SUB-003: candidate count and diversity

How many exact received units and independent lots/batches are required per
primary and substitute, and may two regional labels or packaging aliases count
as independent candidates?

Safe default: aliases do not count without manufacturer evidence; freeze unit
and lot minimums before purchase or results, and require every received unit to
pass with no aggregate rescue.

## SUB-004: approved vendor policy

Which manufacturers, authorized distributors, reseller evidence, jurisdictions,
currencies, quote ages, warranty/return/support minimums, and supply-continuity
horizons may enter the approved-vendor list?

Safe default: exclude marketplaces, used/open-box stock, unidentified sellers,
and unverifiable drop-ship paths. Vendor approval does not qualify a part or
authorize purchase.

## SUB-005: revision, firmware, lot, and alias scope

What exact manufacturer revision, firmware, controller/silicon, lot, accessory,
regional alias, silent-change, incoming-inspection, quarantine, expiry, and
retest rules define one qualification boundary?

Safe default: any unexplained change creates a new candidate. Do not inherit
results through a family name, connector match, marketing suffix, or newer
revision.

## SUB-006: samples, cycles, and soak

What behavioral cycle count, one-/four-hour soak schedule, environmental and
coexistence cases, invalid-run policy, stop rule, retest rule, and independent
review apply to every role?

Safe default: freeze a role-specific schedule before outcomes are visible;
retain all failed, invalid, stopped, retried, adverse, and worst cases.

## SUB-007: acceptable regression

What performance, latency, power, thermal, acoustic, volume, mass, service-time,
and delivered-cost regression limits may a substitute have while preserving
all fixed product gates?

Safe default: never trade away safety, integrity, privacy, recovery, reserved
controls, D-110, or the Pi $650 ceiling. Freeze other regression limits and
ranking weights before testing.

## SUB-008: integrated versus component evidence

Which component checks may run on fixtures, and which complete-product workload,
fault, recovery, physical, TV, controller, camera, storage, and service cases
must rerun on the exact assembled target?

Safe default: component evidence can diagnose, not qualify. Every substitute
must pass the inherited integrated target contract relevant to its role.

## SUB-009: service replacement and data continuity

Who performs replacement, what tools and maximum time apply, which identity and
configuration checks prevent wrong-part admission, and how are profiles, saves,
updates, calibration, pairing, and recovery handled?

Safe default: fail closed on ambiguity; preserve protected state and declared
device-local loss boundaries; rerun calibration, pairing, or recovery checks
when the replaced role affects them.

## SUB-010: list publication and expiry

Who independently approves the exact target-role-vendor-candidate record, how
is expiration or revocation published, and what event forces requalification?

Safe default: publish no approved-vendor list from this blocked plan. Require a
reviewed versioned record, explicit expiry, revocation, and no silent successor
mapping.

## SUB-011: authority

Who authorizes vendor contact, purchase/return, firmware update, destructive or
fault testing, target operation, result retention, qualification, publication,
substitution, and BOM mutation?

Safe default: authorize none from the tracked plan. Bind each permission and
the exact sanitized result contract before operation.
