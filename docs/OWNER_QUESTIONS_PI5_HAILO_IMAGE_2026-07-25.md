# Owner questions: Raspberry Pi 5 and Hailo image

Date: 2026-07-25

Investigation: I-157

The machine-checkable plan is intentionally blocked. Do not download the large
base image, write a card, or treat the public source tuple as installed evidence
until the applicable authority and exact hardware inputs exist.

## Q-257 — base image and graphical package boundary

Should the first test image retain the pinned Raspberry Pi OS with desktop
artifact, or start from the corresponding 64-bit Lite artifact and install an
explicit compositor/browser stack?

The desktop candidate reduces early graphical integration risk but inherits a
larger package and service surface. Lite is smaller but would require an exact
graphical stack decision that Q-047 has not closed. To close Q-257, approve one
base artifact and the required display manager/session, compositor, browser,
audio, input and diagnostics packages; record exclusions and cold-rebuild it
before calling the choice fixed.

Owners: platform, security, operations, performance.

## Existing Q-087 — immutable Hailo and model inputs

Which signed apt snapshot/cache, exact `hailo-all` package tuple, Python lock,
Hailo Apps source identity, resource set, pose HEF and compiled post-processor
may enter the appliance image, and what redistribution boundary applies?

The current plan pins Hailo Apps source `26.03.1` and records vendor candidate
families only. It deliberately does not infer that a future Raspberry Pi apt
repository will install HailoRT 4.23 or TAPPAS Core 5.1.0. Close Q-087 with a
cold offline rebuild, exact hashes/licenses, mismatch/rollback tests and a
retention policy for every required input.

Owners: platform, operations, security, legal.

## Existing Q-254 — exact UVC hardware tuple

Which exact camera part/revision, USB identity, firmware, device path, controls,
cable and enclosure assembly belong in the image manifest?

The Brio remains only a BOM reference. Close Q-254 through camera qualification
and receipt evidence; do not populate the image plan from a product page or an
owned C920 that does not meet the selected shared-camera contract.

Owners: vision, hardware, privacy, safety.

## Write and destructive-test authority

Q-194 and the recovery-image removable-media boundary must authorize exact
cards and destructive operations. A source-plan approval or permission to
download tools is not permission to overwrite removable media, run sudden power
cuts, or promote an image.

Owners: project owner, hardware, QA, safety.
