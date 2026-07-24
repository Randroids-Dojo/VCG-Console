# Owner questions: controller qualification

Last updated: 2026-07-24

These questions block controller compatibility claims and the physical I-152
campaign. They do not block the fail-closed browser adapter changes.

## Q-227: exact blocking controller sample set

Which exact controller models, hardware revisions, firmware versions, and
transports must pass before the first console configuration can be described as
controller-compatible?

Proposed minimum:

- one current first-party USB/Bluetooth standard controller;
- one second-vendor standard controller;
- one 2.4 GHz receiver controller if that transport is claimed;
- one generic or retro ambiguous-layout controller;
- two cross-vendor simultaneous devices.

Please identify owned devices and authorize any loan or purchase. Default:
make no named-device compatibility claim.

## Q-228: guided ambiguous-mapping product scope

Should the first appliance include guided mapping for controllers without a
trusted SDL/standard mapping, or visibly reject them as unsupported?

If guided mapping is required, decide:

- who may create and edit a device mapping;
- how Home, Back, and Pause remain console-reserved;
- whether mappings bind model/revision, receiver, firmware, or one physical
  connection;
- mapping confirmation, reset, expiry, update, and rollback;
- generic glyph behavior;
- recovery when the only connected device is ambiguous.

Default: ambiguous devices stay visible but have no semantic authority.

## Q-229: player assignment and reassignment ceremony

What exact controller-only interaction assigns simultaneous controllers to
players and corrects a wrong assignment?

Needed decisions:

- join-order versus explicit player-slot choice;
- redundant color/shape/number presentation;
- assignment ownership from launcher, Pause, and recovery;
- disconnect grace period;
- replacement and deliberate reassignment;
- relationship, if any, to a local profile;
- behavior for one controller controlling shared menus.

Default: session-local assignment only, never durable association by device
ID, model, serial, or transport address.

## Q-230: reserved-action response budgets

What maximum response time must Home, Back, and Pause meet under normal,
high-load, hung-game, pointer-lock, full-screen, focus-loss, and compositor
recovery conditions?

The product currently requires these actions to remain available but has no
owner-approved numerical p95/p99/worst-case gate. Freeze the budgets before
physical trials.

Default: any swallowed action or action delivered to a game is a blocking
failure regardless of latency; no responsiveness claim is made.

## Q-231: battery support and freshness

Is controller battery status required for the first appliance, and which
platform sources are trusted?

Needed decisions:

- required versus best-effort display;
- units and rounding;
- freshness/expiry window;
- low/critical thresholds;
- charging and unavailable presentation;
- controller-specific exceptions;
- whether a stale reading disappears or remains labeled stale.

Default: show `Unavailable` when an authenticated current reading is absent;
never infer battery state.

## Q-232: campaign repetitions and compatibility claim

Is at least 20 valid cycles per applicable
target/controller/transport/scenario cell sufficient for the first internal
qualification?

Please decide whether public compatibility requires:

- more cycles or multi-day soak;
- multiple physical samples of the same model;
- radio coexistence and distance cells;
- multiple televisions/USB topologies;
- independent operator replication;
- confidence intervals or an upper failure-rate bound;
- a maintained compatibility list and requalification cadence.

Default: 20 valid cycles is an internal pre-registration floor only and cannot
support a broad standards-conformant compatibility claim.
