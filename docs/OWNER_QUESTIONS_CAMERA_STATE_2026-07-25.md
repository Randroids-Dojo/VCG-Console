# Owner questions: camera-state experience — 2026-07-25

The software truth boundary is implemented without these answers. No physical
camera, shutter, indicator, enclosure, room, participant session, or product
copy has been qualified by this tranche.

## Exact shutter and activity-indicator candidate

Which exact selected camera/enclosure revision supplies the physical optical
shutter, and what hardware indication is visible while capture is active?

The qualification record needs the manufacturer/model/revision, shutter
mechanism, lens coverage, indicator electrical authority, viewing angles,
brightness in the selected lighting conditions, failure behavior, and whether
any trustworthy sensor reports shutter position.

Safe default:

- keep software shutter state permanently `NOT SENSED` unless a selected,
  independently qualified sensor exists;
- prefer an indicator tied as directly as practical to real camera activity,
  not merely to application intent;
- do not infer optical blocking from a black image, tracker confidence, or
  missing landmarks; and
- do not change the software state vocabulary to fit marketing copy before the
  hardware truth table exists.

## Across-room comprehension protocol

Who may run the across-room usability study, with which intended adult, child,
seated, low-vision, and color-vision personas, distances, viewing angles, and
lighting conditions?

Safe default:

- first run a camera-free copy/layout rehearsal and an adult-only physical dry
  run;
- require participants to distinguish software disabled, permission blocked,
  active, disconnected, and failed without coaching;
- ask separately what the software says and what they believe about the
  physical shutter, so a correct button press cannot hide a false privacy
  inference;
- retain only consented, minimized categorical results; and
- do not involve a child until consent, assent, room safety, rest, stop, and
  deletion procedures are reviewed.

## Product location and recovery behavior

Should the camera-state surface live only in setup/settings, remain visible
during ordinary play, or also appear in the console pause/recovery overlay?

Safe default:

- keep a persistent, high-contrast active indication in console-owned UI;
- show permission, disconnect, and failure recovery without requiring motion
  input;
- keep controller and keyboard recovery available in every blocked state;
- never let a hosted game replace or contradict the console-owned camera
  state; and
- validate the final location on the intended television from the intended
  seating and play distances before claiming across-room usability.

## Native camera authority

Which native component will own exclusive camera leases, reconcile browser and
operating-system state, stop capture for idle/suspend/profile portrait flows,
and report bounded activity facts to the launcher?

Safe default:

- treat the current browser-only state model as a prototype, not production
  authority;
- require one owner for lease acquisition/release and one closed event format;
- distinguish requested, granted, stream-active, frame-arriving, tracker-ready,
  and optically usable evidence;
- fail closed on stale or contradictory state; and
- keep shutter position absent from the protocol unless qualified hardware can
  report it.

No equipment has been ordered and no participant session has been scheduled.
