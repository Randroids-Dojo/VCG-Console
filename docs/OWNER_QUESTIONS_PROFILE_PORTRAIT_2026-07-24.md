# Owner questions: device-only profile portraits

Last updated: 2026-07-24

The camera-free synthetic rehearsal can proceed without these answers. Real
household capture and family beta cannot.

## Q-179: portrait release gate and shared-TV visibility

Should the first family beta display real household portraits, and should
every profile portrait be visible to anyone at the shared television before a
player is confirmed?

Safe default: ship non-photographic profile art until all I-185 vault,
deletion, exclusion, household, security/privacy, and legal gates pass. If
portraits are later enabled, treat shared-TV visibility as intentional
household disclosure rather than a cryptographic privacy property, test guest
and child reactions, and provide a device-wide portrait opt-out without
weakening calibration or saves.

## Q-180: accepted-still image policy

What exact crop, resolution, encoding, quality, color profile, orientation,
metadata stripping, file-size limit, and decoder are approved for the one
accepted still?

Safe default: retain no source frame or burst; use one fixed square,
orientation-normalized, sRGB, metadata-free, tightly size-bounded derivative
with no animation, auxiliary image, depth, audio, thumbnail, or original.
Choose exact dimensions/encoding only after TV-distance quality, decoder
maintenance, malformed-input fuzzing, vault cost, and both-target performance
are measured. Changing the policy requires a versioned recapture/migration
decision, never silent re-encoding from an unavailable original.

## Q-181: camera lease, countdown, and indicator authority

Which native component owns the exclusive camera lease during portrait
capture, and how will the compositor-visible countdown be bound to camera
activity and the exact still time on each target?

Safe default: one narrow privileged portrait broker stops ordinary tracking,
holds the only capture lease, turns camera-active UI on before frames flow,
binds a monotonic three-second countdown to one session/attempt, captures one
still, then releases the camera before preview. The hardware activity
indicator remains authoritative for electrical activity. Software never
claims the physical shutter is open or closed without a qualified sensor.

## Q-182: credential-free replacement and household misuse

Given D-086's no-admin/no-profile-credential choice, what confirmation and
household safeguards are required before one local user replaces another
profile's portrait?

Safe default: require explicit Profiles management entry, exact target
profile, fresh notice, countdown, temporary preview, and a focused acceptance;
Back/Home always cancels. Body matching, current player identity, portrait
similarity, and controller assignment provide no authority. Keep controller
recovery for every motion step and do not enable real replacement until
sibling, guest, accidental-gesture, simultaneous-player, accessibility, and
consent-withdrawal tests show acceptable risk.

## Q-183: consent, child use, retention, and legal jurisdictions

Which launch jurisdictions and household-age cases are in scope, who may
consent for a child, what affirmative assent/notice is required at capture and
replacement, and when must the accepted portrait be reviewed or deleted?

Safe default: no real portrait collection until qualified counsel and privacy
review approve the exact jurisdictions, age treatment, notice, adult consent,
child assent where applicable, household access, retention, withdrawal,
deletion, and incident response. Store no reusable consent inference in a
portrait or body match. Deletion/profile reset/factory reset removes the
portrait immediately; storage/vault loss and migration require fresh capture
and fresh applicable consent.
