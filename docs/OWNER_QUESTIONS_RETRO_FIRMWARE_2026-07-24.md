# Owner questions: retro firmware and BIOS handling

Date: 2026-07-24

The strict contract defaults restricted or unverified firmware to local
user-supplied import and grants no distribution authority. These questions
remain before product activation.

## RF-001: first firmware-requiring systems

Which exact systems and pinned cores, if any, enter the first milestone, and
which exact firmware revisions/hashes are required versus optional?

Safe default: ship only the no-BIOS 2048 candidate until an individually
reviewed system/core/firmware matrix exists.

## RF-002: legal acquisition wording

What reviewed wording may explain local user-supplied firmware without
claiming ownership, directing users to unauthorized downloads, or implying
that possession is lawful everywhere?

Safe default: explain only that VCG does not supply the file and that the user
must follow applicable rights and local law; provide no download source.

## RF-003: reviewed documentation labels

Which user-facing system/firmware labels and troubleshooting steps map to each
opaque documentation ID?

Safe default: show the system, stable diagnostic class, and a generic
“firmware required” action without exposing filesystem paths or guessed
commercial filenames.

## RF-004: storage protection and sharing

Are imported firmware objects device-wide, profile-scoped, or household-wide,
and do they require encryption or a separately protected namespace?

Safe default: one console-managed device-local firmware namespace, unavailable
to games except through a launch-specific read-only sandbox mount.

## RF-005: removal and reset

Who may remove firmware, what dependent games are blocked first, and does
factory reset delete every firmware object and audit record?

Safe default: local admin confirmation, dependency preview, no deletion during
an active launch, and complete firmware removal during factory reset.

## RF-006: updates and hash migration

When a core changes its accepted firmware set, may an older exact hash remain
usable, and how is a migration or newly optional file presented?

Safe default: a new signed policy revision is required; old policy authority
does not silently transfer, and existing objects are retained but not mounted
until explicitly matched.
