# Owner questions: player and play-zone calibration

Last updated: 2026-07-24

The camera-free rehearsal uses synthetic thresholds and facts only. None of
these defaults authorizes real calibration, persistent measurements, or
active-play safety claims.

## Q-205: production confidence thresholds and evidence

What per-dimension confidence statistic, minimum sample count, time window,
hysteresis, cohort stratification, and error bound permit automatic
progression for floor, play zone, player scale, neutral stance, and usable
range?

Safe default: treat the current 8-sample and `0.82` values as test fixtures
only. Pre-register target metrics against labeled physical ground truth and
gameplay errors, calibrate confidence separately by backend/target/camera
configuration and representative cohort, and require conservative lower
confidence bounds rather than a single convenient average.

## Q-206: required dimensions and conservative fallback

Which calibration dimensions are mandatory for each shell action, obstacle
action, game mechanic, accessibility profile, and seated/assisted mode? When
may neutral stance or usable range use a conservative fallback?

Safe default: floor, safe play-zone, and player-relative scale are
non-skippable for mechanics that depend on them. A title or action profile must
declare its exact requirements. Allow conservative fallback only when measured
tests prove it cannot increase collision, fall, unfair-score, fatigue, or
false-action risk and make the limitation visible before play.

## Q-207: room and camera invalidation authority

Which privileged signal detects camera movement/replacement, mount shift,
resolution/crop/rotation change, enclosure relocation, room/play-zone change,
lighting-driven confidence loss, or floor inconsistency, and how quickly must
it revoke calibration?

Safe default: bind calibration to exact broker-owned camera/configuration and
room-evidence generations, invalidate the complete result before another
Motion/game frame can claim the affected capability, and require a fresh check
after any ambiguous change. Do not infer a physical shutter or stable mount
from browser state.

## Q-208: minimized persistent calibration schema

Which exact room, floor, scale, stance, usable-range, confidence, provenance,
policy-version, accessibility, and invalidation fields persist under D-078?
Which values are too identifying or unstable to retain?

Safe default: persist only versioned derived values required by qualified
actions, their confidence/provenance and invalidation bindings. Store no raw
frame, landmark trace, portrait derivative, face data, arbitrary provider
payload, or free-form room map. Keep the record in the console-bound vault,
exclude every backup/export/diagnostic/support/recovery path, and make
reset/delete/expiry explicit.

## Q-209: child, seated, assisted, and mobility-changing guidance

What separate automatic and guided paths are safe and comprehensible for
school-age children, short/tall adults, seated players, limited range,
prostheses, mobility aids, assisted play, fatigue, temporary injury, and
changing mobility?

Safe default: never treat standing full-body geometry as universal. Define
explicit supported capability profiles and alternate controller mappings,
qualify each with representative consented participants, abstain when the
profile is unsupported, and keep a controller-only path. Do not use one
group's confidence threshold or range normalization for another without
evidence.

## Q-210: automatic progression and visible review timing

After a qualified automatic pass, should the launcher immediately continue,
briefly show what it understood, or require confirmation for first use,
changed rooms, high-risk mechanics, or material calibration changes?

Safe default: always render the understood-state summary long enough to be
perceivable, but avoid routine ceremony after a stable repeat pass. Require
explicit confirmation for first use, changed room/camera, materially reduced
range, conservative fallback, or a capability change that affects safety,
accessibility, or scoring. Preserve Back/Home and controller alternatives.
