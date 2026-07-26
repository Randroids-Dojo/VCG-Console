# Owner questions: local diagnostics

Last updated: 2026-07-24

These questions do not block the volatile closed-code browser prototype. It
stores nothing across reload, exports only reviewed structured codes after
admin confirmation, and has no network path.

## Q-148: native retention and rotation

How much native diagnostic history should survive reboot: a byte ceiling, a
boot-count ceiling, an elapsed-time ceiling, or a combination?

Safe default: use both a small fixed byte budget and a small fixed number of
boot epochs, evict oldest complete records, reserve no recovery headroom for
ordinary logs, and keep log-pressure failure from blocking boot, Home/Back,
local play, update rollback, or save commits. Do not choose a duration until a
trusted clock policy exists.

## Q-149: export destination and support workflow

Should a consented bundle be written only to attached user-selected media,
made available to a paired administrator workstation, or support both?

Safe default: no WAN upload, automatic telemetry, email, QR payload, or hidden
support endpoint. Require local admin authorization, exact on-screen preview,
an explicit destination, one-shot capability, cancellation, bounded bytes,
and a post-export reminder that the resulting user-held file follows the
destination's retention.

## Q-150: useful device and time provenance

Which coarse hardware/software and time fields are necessary for diagnosis
without introducing stable household identifiers or misleading timestamps?

Safe default: include public software versions, platform class, boot-relative
monotonic timings, and explicit clock-quality labels only. Exclude serial
numbers, MAC/IP addresses, workstation/profile IDs, precise location, and
unverified wall-clock values. Add an exact field only after a concrete support
exercise proves it necessary.
