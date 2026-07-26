# Household active-play safety checklist

Last updated: 2026-07-24

This checklist closes the hazard-identification work in I-012. It defines when
an active VCG Console session must not start, must pause, or must stop. It does
not certify a room, enclosure, game, or person as safe and does not replace
product-specific instructions, medical advice, adult judgment, or a qualified
home-pilot review.

The first prototype requires a clear 8 x 8 ft (2.4 x 2.4 m) play zone. Camera
coverage never substitutes for physical clearance. A visible body can still
collide with furniture, another person, a pet, a cable, or the television.

## Decision rule

Every applicable pre-play item is `pass` or the session does not start. `Not
applicable` requires a short reason; silence is not a pass. During play, any stop
condition pauses simulation, hazards, scoring, and motion actions immediately.
Resume requires a deliberate controller-accessible confirmation after the
condition is corrected.

Use these result values in room and session sheets:

| Result | Meaning |
|---|---|
| `pass` | Observed and acceptable for this exact session. |
| `fail` | Session is blocked until corrected and rechecked. |
| `not-applicable` | Hazard is absent; record why. |
| `stopped` | A runtime condition ended or paused the session; retain the event and response. |

No waiver, “play carefully” message, camera warning, or participant consent may
turn a failed physical condition into a pass.

## Pre-play hard gate

### Zone, floor, and falls

- [ ] The full marked 8 x 8 ft zone and a practical entry/exit path are clear
  of tables, stools, toys, bags, exercise equipment, packaging, and other
  clutter.
- [ ] No sharp corner, glass edge, fireplace/heater, stair, open doorway,
  balcony/window hazard, or hard projection is reachable by the widest
  requested step, arm swing, duck, or loss of balance.
- [ ] The floor is dry, level, intact, and free of loose rugs, curled mat edges,
  torn surfacing, thresholds, and other trip or ankle hazards.
- [ ] The participant uses ordinary footwear or bare feet appropriate to the
  actual floor; loose socks or unstable footwear are not used on a slick
  surface.
- [ ] The requested actions fit the room. Jump, deep duck, or wide dodge is
  disabled when ceiling, floor, balance, clothing, mobility, or clearance makes
  it inappropriate.
- [ ] The participant can reach a stable resting place outside the movement
  envelope without crossing a cable or equipment path.

### Television, furniture, and objects

- [ ] The television and any furniture that could be bumped, pulled, climbed,
  or toppled are mounted or anchored according to their manufacturer
  instructions.
- [ ] A television that is not wall-mounted sits on furniture designed to hold
  it, on a sturdy low base, positioned as far back as the installation permits,
  and is restrained against tip-over.
- [ ] Heavy items are low and stable. Remotes, toys, and attractive objects do
  not invite a child to climb near the television or play zone.
- [ ] Shelves, speakers, lamps, frames, plants, decorations, and loose objects
  cannot fall into the zone under an ordinary bump or floor vibration.
- [ ] Furniture anchors and restraints have no visible damage, looseness, or
  unresolved recall/safety warning. Presence of a strap alone is not treated as
  proof that it is suitable or installed correctly.

### Power, signal, and camera cables

- [ ] Power, HDMI, USB, Ethernet, controller, and extension cables remain
  completely outside the play and entry/exit paths or are secured with a
  purpose-appropriate cover that cannot lift or slide.
- [ ] No cable crosses open floor under a loose rug, hangs where a child or pet
  can pull it, forms a loop, or carries the enclosure into the zone if snagged.
- [ ] Connectors have strain relief; plugs and power supplies are undamaged,
  fully seated, ventilated, and not daisy-chained beyond their instructions.
- [ ] The physical camera shutter, activity indication, power disconnect, and
  console stop/shutdown control remain visible and reachable without entering
  the active zone.

### Console enclosure, heat, and ventilation

- [ ] The prototype box, camera, computer, stand, and nonslip base are stable
  under cable tug, ordinary floor vibration, and the intended camera pitch.
- [ ] Fasteners, cut edges, ports, vents, fan openings, and cable exits have no
  accessible sharp edge, pinch point, exposed conductor, or small loose part.
- [ ] Intake and exhaust paths are unobstructed and the enclosure is not on
  fabric, carpet pile, or another surface that blocks cooling.
- [ ] The system has completed its preflight checks with no thermal, fan,
  storage, power, camera, controller, or tracker fault.
- [ ] No surface that a participant may touch is uncomfortably hot, and there
  is no unusual smell, smoke, discoloration, noise, or vibration.

### People, pets, and household traffic

- [ ] Everyone nearby knows that active play is starting and which floor area
  must remain clear.
- [ ] Doors and routes that would let a person enter the zone unexpectedly are
  closed, watched, or otherwise controlled for the session.
- [ ] Pets are outside the active zone in a comfortable controlled area; a pet
  is not expected to “stay out of the way” beside a moving participant.
- [ ] Spectators remain outside both the movement envelope and the camera's
  candidate/join region. Mirrors and television people are covered, repositioned,
  or included in the tracking abuse-test plan rather than ignored.
- [ ] A household adult actively supervises a school-age-child prototype
  session and can stop the console without relying on the child's gesture.
- [ ] Only the pre-registered player count is active. Additional children or
  adults do not join an unqualified shared zone.

### Participant readiness and stop path

- [ ] The participant says the requested movement is comfortable today and can
  skip any action or stop without penalty.
- [ ] The participant is not asked to play through pain, dizziness, weakness,
  unusual shortness of breath, cramping, illness, medication effects, or
  fatigue. VCG does not decide medical readiness.
- [ ] Water and a comfortable cool rest location are available.
- [ ] The participant demonstrates the controller Back/Home path and the adult
  or test operator demonstrates the physical stop path before motion scoring.
- [ ] Clothing, jewelry, laces, assistive devices, and carried objects will not
  snag, obstruct vision, or strike the participant during the planned actions.
- [ ] Consent/assent, raw-recording state, requested action exclusions, and the
  participant's stop signal are confirmed under `PLAYER_PERSONAS.md`.

## Runtime pause and stop conditions

Pause the game and stop accepting motion actions on any of these observations:

- a person or pet enters or is about to enter the active zone;
- an object, cable, rug, enclosure, camera, stand, or piece of furniture moves
  into an unsafe condition;
- the player leaves the marked zone, loses balance, falls, collides, or cannot
  see/hear the console feedback needed to continue;
- tracking loss, identity ambiguity, camera movement, controller loss, or a
  software fault makes recovery intent uncertain;
- the participant asks to pause/stop, appears distressed, or reports pain,
  dizziness, weakness, unusual shortness of breath, cramping, overheating, or
  fatigue;
- the enclosure reports a thermal/power/fan fault or shows unusual heat, smell,
  smoke, noise, or vibration; or
- the supervising adult or operator cannot maintain the clear-zone gate.

If someone feels faint or weak during exertion, CDC heat guidance says to stop
activity and move to a cool place. The console must not diagnose a cause or
offer a countdown that pressures the participant to resume. Seek appropriate
local help for an injury or concerning symptoms.

A fall, collision, smoke/electrical event, damaged anchor, damaged cable, or
enclosure instability ends the session. Do not use ordinary Resume until the
incident is assessed and the entire pre-play gate is repeated.

## Break and duration policy

The prototype displays a non-dismissed-with-motion break offer after 20 minutes
of accumulated active play and every 20 active minutes thereafter. The timer
stops while paused. This is a conservative test default, not a medical claim or
permission to play for 20 minutes when someone needs a break sooner.

The reminder:

1. freezes gameplay without discarding the current safe checkpoint;
2. says `TAKE A BREAK?` and offers `REST` as the focused choice;
3. permits deliberate controller selection of `CONTINUE`;
4. never uses motion as the only way to rest, stop, or exit;
5. does not display calories, fitness targets, guilt, streak loss, or a claim
   that continuing is safe; and
6. records only reminder delivery and the selected action, not a health reason.

School-age-child pilot sessions additionally pause between pre-registered trial
blocks. The supervising adult may shorten a block or end the session at any
time. Exact product cadence remains subject to home-pilot and specialist review
under Q-076/I-144.

## Post-play checklist

- [ ] Gameplay and motion actions are stopped before the participant leaves the
  zone or equipment is moved.
- [ ] Camera capture stops, the camera-active indication clears truthfully, and
  the microphone remains disabled.
- [ ] The enclosure returns to its qualified idle state with no heat, fan,
  storage, or power fault.
- [ ] Cables, anchors, furniture, floor, and enclosure are inspected after any
  snag, bump, vibration, or participant contact.
- [ ] Every stop, near miss, fall, collision, unintended privileged action,
  fault, discomfort report, or checklist failure is retained in the issue log.
- [ ] The evidence report does not convert “no incident observed” into a general
  safety claim.

## Required abuse and household scenarios

The checklist itself must be exercised, not merely acknowledged. Before a home
pilot, verify that setup or runtime blocks each scenario safely:

| Scenario | Required result |
|---|---|
| Loose rug edge or toy in zone | Pre-play `fail`; no Start action. |
| HDMI/USB cable pulled toward zone | Enclosure remains stable or preflight fails; no camera/console fall. |
| Unanchored reachable furniture or TV | Pre-play `fail`; supervision alone cannot override it. |
| Pet or passerby enters during dodge/jump | Immediate freeze; deliberate recovery only after zone is clear. |
| Spectator/mirror/television person appears to tracker | No automatic join/takeover; log candidate evidence. |
| Camera/box shifts after calibration | Freeze and invalidate placement/calibration before Resume. |
| Controller disconnects during stop prompt | Motion does not auto-continue; physical/alternate stop remains. |
| Tracker or UI hangs | Host/compositor Home/Back/termination path remains outside game capture. |
| Thermal/fan/power fault | Stop workload, clear camera state, show controller-accessible fault/exit. |
| Participant requests stop mid-action | Stop immediately; no hold completion, score penalty, or reason demand. |
| Break reminder during hazard approach | Freeze simulation at a safe checkpoint; Rest remains focused. |

## Evidence and source boundary

- CPSC's [Anchor It! guidance](https://www.cpsc.gov/Safety-Education/Safety-Education-Centers/AnchorItgov)
  calls for anchoring televisions and furniture, using sturdy TV furniture, and
  removing objects that tempt children to climb.
- CPSC's [playground checklist](https://www.cpsc.gov/safety-education/safety-guides/playgrounds/public-playground-safety-checklist)
  identifies falls and trip hazards as primary concerns. This indoor checklist
  borrows the conservative principles of clear surfaces and active supervision;
  it does not represent a living room as a compliant playground.
- CDC's [heat and activity guidance](https://www.cdc.gov/heat-health/risk-factors/heat-and-athletes.html)
  advises pacing activity, drinking water, monitoring participants, and
  stopping when faint or weak. VCG uses only the stop/minimization principle
  and makes no athletic or medical qualification claim.

This repository has not completed a qualified room survey, anchor inspection,
electrical review, enclosure review, home pilot, or legal/specialist review.
Those remain I-001, I-002, I-037, I-046, I-140, I-143, I-144, I-192, I-194,
I-195, and I-196.
