# Owner Questions: Sudden-Power Campaign

These questions block the interpretation and physical execution of I-202, not
continued fixture, oracle, or transition-instrumentation work. Stable `Q-`
identifiers are intentionally deferred while another agent owns active shared
worktree files; allocate the next available identifiers during reconciliation.

## Reliability claim beyond the 200-trial floor

Should the campaign make only the bounded claim “zero failures across this
transition-complete frozen schedule,” or must it also support a numerical
field-reliability/confidence target?

Current conservative default: require at least 200 valid zero-failure trials
and complete transition coverage, but make no field failure-rate claim. A
statistical reliability claim needs a selected confidence level, exposure
model, independent-trial assumptions, environmental/duty-cycle distribution,
sample and lot count, and treatment of correlated failures. More repeated desk
cuts do not automatically represent years of household use.

Needed decision/evidence: acceptable field claim, confidence level, maximum
failure probability or service reliability target, whether the claim is per
boot/cut/hour/device, and the card/lot/environment sample design permitted by
the lab budget.

## Electrical event scope

Should I-202 qualify only ordinary abrupt mains/input removal through the
production-intended supply, or also deliberate brownout, short dropout,
undervoltage, oscillating reconnect, and long-hold emergency-cut waveforms?

Current conservative default: the P0 schedule must at least remove input
through the exact production supply and capture the resulting rail decay.
Treat an uncontrolled or unmeasured brownout as a harness-invalid trial, not a
pass. Add deliberate waveform testing as a separately identified electrical
fault stratum only after the fixture is reviewed for operator, Pi, card, and
power-supply safety.

Needed decision/evidence: in-scope household power events, exact switched
input/rail, production supply model, voltage/current observation bandwidth,
minimum off interval, reconnect behavior, acceptable fixture isolation, and
whether electrical-fault testing is required before prototype, family beta,
or final hardware acceptance.
