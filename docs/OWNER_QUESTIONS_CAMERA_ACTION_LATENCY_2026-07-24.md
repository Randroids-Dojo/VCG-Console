# Owner questions: camera-to-action latency — 2026-07-24

The machine-checkable method is complete without these answers. Physical I-015
execution cannot make a trustworthy or consented claim until they are
resolved. This file reserves Q-211 and Q-212 after the calibration tranche's
Q-205 through Q-210.

## Q-211: exposure-timestamp and optical reference equipment

What timing equipment is already available for validating the exact camera
exposure timestamp and, where practical, independently checking visible
response?

Useful inventory includes:

- a high-speed camera with a verified 240 FPS or faster mode;
- a photodiode, oscilloscope, logic analyzer, microcontroller, or timestamped
  LED/light sensor;
- a controllable low-latency LED or display stimulus;
- tripods/mounts that can view the stimulus and response without recording the
  room or participant; and
- known calibration, clock, cable, or frame-rate limitations.

Safe default:

- do not treat C920 frame arrival, browser callback time, or a driver timestamp
  label as exposure time;
- first build a minimized LED/photodiode or high-speed optical correlation rig
  that validates the timestamp semantics for the exact camera mode;
- bind exposure and clock-mapping proof artifacts by SHA-256;
- add worst-case timing uncertainty to every latency sample; and
- if no suitable independent visible-response equipment is available, record
  that fact in the frozen plan rather than buying or improvising a misleading
  substitute.

No equipment has been ordered.

## Q-212: blocking-persona and consented room session

Who may participate, and when may the adult-standing and school-age-child
standing sessions run in the selected primary room?

The session needs:

- the room and safe 8 x 8 ft zone checked first;
- informed household consent and age-appropriate assent;
- a stop/cancel procedure independent of motion;
- separate results for each blocking persona and placement;
- 200 action attempts plus at least 15 minutes of negative/idle evidence per
  declared cell;
- the representative concurrent workload; and
- skeleton/event/ground-truth/system traces without raw video by default.

Safe default:

- rehearse the complete operator procedure with one consenting adult first;
- treat that as an adult-only cell, not a full prototype pass;
- do not recruit or record a child until the room, safety, consent, retention,
  instructions, rest breaks, and immediate deletion procedure have been
  reviewed with you; and
- stop on fatigue, confusion, discomfort, unsafe movement, or loss of the
  independent Back/Home path. A stopped attempt remains `invalid` and cannot
  be silently replaced.

Q-204 separately controls when the C920/controller hands-on compatibility
session occurs. One coordinated session may gather both sets of evidence only
if the timestamp, safety, consent, and workload prerequisites are already
complete.
