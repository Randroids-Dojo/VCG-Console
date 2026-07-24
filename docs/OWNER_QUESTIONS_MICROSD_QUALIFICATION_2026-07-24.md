# Owner Questions: microSD Qualification

These questions block a physical qualification conclusion, not continued
protocol and harness work. Stable `Q-` identifiers are intentionally deferred
while another agent is modifying the shared worktree; allocate the next
available identifiers when the tree is reconciled.

## Exact card suffix and revision scope

May the quoted `SDSQQNR-256G-AN6IA` be accepted as the same qualification
boundary as SanDisk's currently listed `SDSQQNR-256G-GN6IA`, and what proof is
required before treating a suffix or silent card-controller revision as
equivalent?

Current conservative default: treat them as distinct until SanDisk or an
authorized reseller provides a written mapping. Require the received package,
card markings, date/batch code, and host-readable identity to match the
approved intake record; quarantine any substitute or unexplained revision.

Needed decision/evidence: acceptable regional/packaging aliases, approved
seller evidence, permitted controller/date-code changes within a qualified
lot, retest scope after a change, and return/replacement behavior.

## Destructive cohort and lot budget

How many 256GB cards may the qualification campaign purchase and destroy, how
many independent purchase lots must it cover, and should one unpowered control
be retained?

Current conservative proposal: at least three tested cards across at least two
date/batch-code lots when obtainable, plus one retained control from a tested
lot. This is a proposal, not purchase permission, and it may exceed the current
reference BOM if charged to the production unit.

Needed decision/evidence: maximum lab budget, whether test media is excluded
from the delivered unit's $650 cap, sample count, lot count, retained-control
duration, failed-card disposition, and whether destructive intake/endurance
testing is authorized.

## Service horizon and endurance margin

What appliance service horizon, daily duty cycle, workload growth allowance,
and safety margin must the selected card meet?

Current conservative default: do not translate SanDisk's advertised Full HD
video hours into console life and do not claim a service duration. Measure
high-case daily block writes from the final workload, project them across the
selected horizon, and require the destructive cohort to reach that projection
plus the chosen margin without a mandatory failure.

Needed decision/evidence: service years, expected and high daily active hours,
idle/on behavior, update cadence, household library churn, growth factor,
required write margin, and whether the warranty period has any product-policy
meaning beyond replacement eligibility.

## USB SSD fallback trigger and comparison scope

Should any valid committed-state corruption or rollback/protected-state safety
failure immediately reject microSD, or may an identified software defect be
fixed and the entire card campaign restarted?

Current conservative default: never waive a failure. A proven harness defect
may invalidate a trial; a proven software defect may be fixed only in a new
frozen build followed by a fresh applicable campaign. Any unexplained media
fault, identity drift, committed corruption, unbounded recovery, or inability
to reach the service-write target invokes I-021.

Needed decision/evidence: permitted root-cause/retest policy, whether a failure
on one cohort member rejects its entire lot or the product family, the minimum
fresh rerun after software changes, and which exact USB SSD
bridge/enclosure/cable candidates may enter I-021. The fallback still requires
its own power, disconnect, update, corruption, recovery, cost, and enclosure
qualification.
