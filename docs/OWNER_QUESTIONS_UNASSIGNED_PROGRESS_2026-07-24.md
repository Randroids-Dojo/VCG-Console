# Owner questions: Unassigned Progress

Last updated: 2026-07-24

These answers do not block the bounded desk prototype. They block final
production copy, per-title policy, and household qualification for I-190.

## Q-170: required conflict outcomes

Must every compatible game support Keep Both and Replace when a target profile
already owns the same slot, or may its signed policy expose only the outcomes
that its save format can preserve safely?

Safe default: never offer Merge. Offer Keep Both only after the exact runtime
adapter proves a new distinct slot can be created without game-authored path
selection or hidden identity carryover. Offer Replace only through a separate
permanent-loss confirmation. If neither is safe, let the household keep the
current profile progress, play the unassigned slot without claiming, or delete
it.

## Q-171: game-authored metadata allowlist

Which game-authored values may appear in the unassigned list and detail screen
beyond host-owned title, slot label, last-played time, package version,
compatibility, and byte count?

Safe default: omit arbitrary metadata. Permit a progress summary only through a
versioned reviewed per-game extractor with strict text/count bounds, no raw
save fragments, no profile IDs, no names copied from deleted profiles, and a
synthetic canary test. Missing metadata is preferable to retaining identity or
rendering hostile text.

## Q-172: credential-free claim and replacement ceremony

For a shared household console with no admin or per-profile credentials, what
deliberate confirmation is sufficient to claim an unassigned slot, and must a
destructive replacement require controller/remote input even when motion
navigation is enabled?

Safe default: a non-conflicting claim requires explicit target selection and
one confirmation. Replace and permanent delete require a second scoped
confirmation after the warning. Keep motion parity for browsing and ordinary
confirmation, retain controller/remote Home and Back as universal recovery,
and do not treat a body match or current player session as authentication.
Test sibling, guest, accidental-gesture, and simultaneous-player cases before
family qualification.

## Q-173: unavailable-package retention

How long should unassigned progress remain when its game package is unavailable
or no installed version can read it?

Safe default: retain it within the normal per-game save quota until explicit
permanent deletion or whole-console destructive reset. Do not silently reclaim
it for low space, package uninstall, profile recreation, or elapsed time.
Clearly disable Play, show the exact compatibility state, and allow claim or
delete independently of package execution.

## Q-174: hosted-service guidance

Should remote-web entries show service-specific account-data deletion guidance,
and who owns the accuracy and lifecycle of that copy?

Safe default: always state that this screen affects only console-local browser
data and cannot inspect or delete hosted-service account data. Add a
service-specific help destination only when it comes from the signed reviewed
catalog, uses the supervised browser lane, and has a named maintenance owner.
Never imply that deleting local progress closes an account or removes service
data.
