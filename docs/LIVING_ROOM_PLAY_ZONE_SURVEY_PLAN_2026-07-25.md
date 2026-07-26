# Living-room and play-zone survey plan

Date: 2026-07-25

Status: strict blocked I-001/I-002 plan; no room or safety result

Authority: D-031, D-071, D-090, D-102 and D-103

## Outcome

[`living-room-play-zone-plan-v1.json`](../benchmarks/room-survey/living-room-play-zone-plan-v1.json)
pre-registers the survey. Its strict validator and adversarial tests are
`scripts/validate-living-room-play-zone-plan.mjs` and the matching test file.

This advances I-001/I-002 without inventing private room facts. It defines how
to measure the selected primary room, TV, normal furniture, light, power,
network, mounting and collision environment and how to prove the required
one/two-player 8 by 8 ft zone. It authorizes no room access, photography,
participant session, furniture movement, electrical/network inspection,
purchase, drilling, cutting or mounting.

## Coordinate and measurement contract

All dimensions use finished accessible surfaces in millimetres. The origin is
the primary TV active-picture horizontal center projected to the finished floor
at the TV face plane. Positive x is viewer-right, y points away from the TV and
z points upward. Estimated values cannot qualify.

Twelve required measurement groups cover:

- room outline, ceiling and overhead obstruction;
- TV active picture, face plane, support, ports and cable access;
- seating and player-distance envelope;
- furniture and fixed obstacles;
- doors, drawers, recliners and egress;
- windows, mirrors, breakables and reflection directions;
- reproducible daylight/warm/cool/TV-only/dim light states;
- outlets, reviewed circuit/load identity and cable routes;
- network availability without addresses or credentials;
- floor material, transitions, rugs, vents, slopes and trip conditions;
- the below-TV prototype envelope; and
- external camera placement candidates without selecting one.

The result must bind the exact tool/calibration, operator protocol, abstract
floor plan, privacy review, safety review and redacted contact sheet.

## Required play zone

The required one/two-player zone is one contiguous survey-coordinate rectangle
at least 2438.4 mm wide by 2438.4 mm deep: exactly 8 by 8 ft minimum. It must:

- avoid every mapped hazard envelope;
- preserve household egress;
- remain valid with normal furniture and door positions;
- mark one- and two-player subzones; and
- review simultaneous movement and arm span for a school-age child and adult.

A later four-player zone is exploratory. It is not required and cannot rescue a
failed one/two-player zone. Seated placement is exploratory here and cannot
replace required standing child/adult evidence.

Obstacle, inter-player, slope, camera-margin and viewing-distance gates remain
null until approved before measurement. The zero-hazard-overlap, zero-blocked-
egress, strain-relief and stability gates are fixed.

## Camera and physical evidence

The below-TV integrated prototype is the required placement role. External
beside/above-machine and TV-top/shelf positions are additional candidates.
No fixed optical axis is selected.

A camera preview or diagram cannot prove coverage. Closure requires the exact
camera/lens/mode, mount, room/floor calibration, physical child/adult one/two-
player coverage, floor contact, action accuracy and setup-error/recalibration
evidence. Four-player coverage cannot rescue one/two-player failure.

## Privacy boundary

Raw home photographs must not enter the repository or released evidence. A
local workflow may produce only reviewed redacted derivatives after stripping
EXIF/GPS/device metadata and redacting faces, names, addresses, mail, screens,
reflections and household identifiers.

Do not record SSIDs, credentials, MAC/IP addresses, traffic, or stable TV,
camera, router and device serials. The repository may retain the abstract
dimensioned floor plan and cryptographic digests of approved redacted views.

## Remaining boundary

I-001/I-002 remain active. The primary room, privacy consent, measurement tools,
normal configuration, exact TV/camera/enclosure/mount/cable tuples, body/reach
protocol, numeric clearances, room access, photographs, measurements, hazard
map, floor plan, zone and physical coverage/safety result are absent.

Run the focused gate directly until the concurrently owned `package.json`
tranche is committed:

```text
node scripts/validate-living-room-play-zone-plan.mjs
node --test scripts/validate-living-room-play-zone-plan.test.mjs
```
