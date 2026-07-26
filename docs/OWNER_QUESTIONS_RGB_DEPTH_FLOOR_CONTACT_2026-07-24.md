# Owner questions: RGB versus depth floor contact

Date: 2026-07-24

The plan and validator are complete without this answer. No physical campaign
should start until the instrumentation and event-error decision are frozen in
a superseding plan.

## Q-235: contact reference and acceptable event error

Which independent foot-contact reference should be used, and what maximum
event-timing error should qualify an RGB strategy for gameplay?

The plan currently requires depth plus an independent synchronized contact
reference because depth alone cannot prove the instant of physical contact.
It pre-registers at most 5 ms measured stream synchronization error and 8 ms
reference uncertainty, but deliberately leaves the product event-error gate
unset.

Candidate contact references include:

- a characterized pressure/contact mat spanning the movement area;
- instrumented insoles sized and consented for each participant; or
- a high-speed independently timestamped view with blinded frame labeling,
  if privacy and retention are separately approved.

Safe default:

- do not treat depth alone as contact truth;
- do not begin participant collection until the exact reference device,
  calibration, synchronization, threshold, and uncertainty are frozen;
- preserve separate takeoff, apex, landing, left/right contact-loss, and
  contact-gain distributions;
- require the gate per persona and camera position rather than only in the
  aggregate;
- retain every invalid, missed, and spurious event;
- keep D-110's full 120 ms p95 action gate independent; and
- select no RGB strategy while `eventTimingGateMs` remains `null`.

Please specify the acceptable p95 and worst absolute event error for Jump
takeoff/landing and Step contact loss/gain. Apex may use a separate bound. If
you prefer a pressure mat or instrumented insoles, please also confirm whether
the project may purchase or borrow the exact reference hardware after a
quote-date review.
