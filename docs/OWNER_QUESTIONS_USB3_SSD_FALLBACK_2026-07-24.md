# Owner Questions: USB 3 SSD Fallback

These questions block selection or purchase of an I-021 fallback, not continued
microSD qualification or USB fixture preparation. They follow the sudden-power
campaign tranche's Q-197 and Q-198.

## Q-199: fallback capacity

May the USB fallback use a 1TB integrated portable SSD when the selected
microSD baseline and D-111 storage line specify 256GB?

Current conservative default: allow a larger smallest-available integrated
device only if it is the lowest-risk and lowest-complete-cost fallback, but
retain the measured quotas, bounded logs/caches, A/B sizes, and recovery reserve
derived from the intended workload. Extra capacity must not conceal unbounded
writes or expand the supported content promise without a separate decision.

Needed decision/evidence: minimum/maximum fallback capacity, whether D-048
needs a superseding decision, whether partition sizes remain identical to the
qualified 256GB layout, and whether unused capacity stays unallocated or joins
the bounded writable partition.

## Q-200: mechanical integration and service

Should the fallback SSD be retained inside the ABS console enclosure with a
serviceable bracket, or may it remain externally attached?

Current conservative default: require an internal or enclosure-integrated
nonconductive serviceable bracket, positive retention, connector strain relief,
thermal clearance, and no adhesive-only life-safety assumption. External
tethering increases household disconnect, leverage, clutter, and lost-drive
risk and should not be the reference product.

Needed decision/evidence: enclosure service opening, permitted fastener and
bracket material, tool requirements, connector-cycle target, user-replaceable
versus service-only policy, cable bend radius, airflow/temperature limit, drop
and pull test, and whether mount hardware must fit D-111.

## Q-201: powered-hub escalation

If every otherwise passing integrated SSD exceeds the safe measured Pi USB
budget, may I-021 add a powered USB hub or separately powered enclosure?

Current conservative default: no. Reject the bus-powered candidate and present
a superseding hardware/BOM comparison. A powered hub adds another supply,
bridge, cable, boot-order and sequencing dependency, physical volume, cost,
standby load, and sudden-disconnect surface.

Needed decision/evidence: whether one additional supply is acceptable in the
lower-cost appliance, approved hub/enclosure topology, power sequencing,
back-power prevention, enclosure/thermal integration, delivered-cost ceiling,
and whether the added complexity makes an x86 reference more valuable.

## Q-202: comparative sample authority

Should the project acquire one exact USB SSD as a lab comparison before
microSD fails, or keep I-021 strictly contingent on a valid microSD failure?

Current conservative default: prepare the harness and keep watching the
Kingston `SXS1000/1000G`, but purchase nothing. If an early comparative sample
would materially accelerate recovery/power-cut tooling, authorize it as
lab/spare equipment outside the production unit's delivered BOM while still
requiring a fresh production quote later.

Needed decision/evidence: lab budget, whether spare/destructive media is
excluded from D-111, acceptable seller, exact part, maximum item/delivered
price, return policy, and whether the owner authorizes a purchase before the
microSD campaign reaches a fallback trigger.
