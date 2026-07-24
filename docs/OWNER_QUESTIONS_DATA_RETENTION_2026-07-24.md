# Owner questions: data retention and deletion

Date: 2026-07-24

The repository now has one current-state register for skeletons, diagnostics,
profiles, and saves. These choices are still required before implementing a
unified native lifecycle service.

## DR-001: native diagnostic retention

What maximum age, byte count, event count, and boot/session count may the
future native diagnostic store retain?

Safe default: a small fixed byte/event cap plus a short fixed age, whichever
expires first. Use stable codes and monotonic/boot-relative timing only; no
free text, wall-clock identity, paths, profile/game IDs, or automatic upload.

## DR-002: crash evidence

May native crashes produce core dumps or memory snapshots on family devices?

Safe default: no. Disable general core dumps. Add only a separately reviewed,
bounded minidump format after proving it cannot contain raw frames, skeletons,
portraits, calibration/body features, saves, credentials, or imported
content.

## DR-003: trace exports

Should skeleton-trace export exist on public family images, developer images
only, or both?

Safe default: developer/admin mode only, with local review and explicit
download. Keep normal play entirely volatile and never upload automatically.

## DR-004: profile deletion and compatible progress

Must every admitted game provide an exact identity-stripping sanitizer before
it can store profile-linked progress?

Safe default: yes. Otherwise profile deletion must require a separate visible
choice to permanently delete that exact incompatible progress record.

## DR-005: deletion completion standard

Does product copy promise logical inaccessibility, cryptographic erasure,
physical overwrite, or some combination for portraits and body-profile data?

Safe default: promise only what the selected encrypted vault and filesystem
can prove. Prefer immediate key/render revocation plus cryptographic erasure;
do not promise byte overwrite on flash storage without target forensic
evidence.

## DR-006: save retention

Should console-managed saves ever expire automatically because they are old
or the corresponding game is uninstalled?

Safe default: no. Preserve saves until exact deliberate deletion or factory
reset; uninstall may disclose and offer deletion but cannot silently combine
package removal with progress removal.

## DR-007: factory reset

Should factory reset delete imported retro content and installed production
packages as well as profiles, saves, diagnostics, and developer data?

Safe default: always delete profiles, portraits, calibration/body data, saves,
diagnostics, credentials, pairing, and developer state. Require a separate
owner decision for installed packages and imported retro content, with clear
time/space and resale/privacy tradeoffs.

## DR-008: hosted-service guidance

Which hosted games require specific sign-out, account-deletion, or service
support instructions after local profile/save deletion?

Safe default: maintain a per-title reviewed guidance record. Never use generic
copy that implies the console deleted service-controlled data.

## DR-009: support workflow

May a support agent ever request diagnostic or skeleton files, and through
which transport?

Safe default: the user reviews and exports one exact local bundle, then
chooses an ordinary explicit transfer outside the console. No permanent
support listener, remote shell, background uploader, or reusable support
credential.
