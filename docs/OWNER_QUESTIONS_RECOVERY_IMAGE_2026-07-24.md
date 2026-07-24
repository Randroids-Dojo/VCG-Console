# Owner Questions: Recovery Image

These choices are deliberately not inferred by the verifier. The current code
performs no download, media selection, write, or destructive recovery.

## Q-175: recovery signing and compromise authority

Who holds the recovery-image signing threshold, and what may it authorize when
the ordinary online update root or stable-channel keys are suspected
compromised?

Current conservative contract: recovery images use a distinct
`recovery-image` artifact role and fixed signature domain with non-reused keys.
They do not inherit authority merely from `system-image` signing.

Needed decision: custodians and threshold, online/offline custody, root-anchor
distribution, emergency revocation/rotation, trusted-time behavior while
offline, whether recovery may replace a compromised protected root, and the
physical/user ceremony required to do so.

## Q-176: exact recovery hardware identity

What exact assembly identifier and compatibility policy should the recovery
manifest use for the first Pi 5 reference build?

Current conservative contract: the signed manifest carries a small sorted
allowlist and the tool requires a separately selected exact hardware ID. It
does not infer compatibility from “Pi 5” marketing text or a string supplied
only by the downloaded manifest.

Needed decision: board revision/RAM/HAT/storage/enclosure facts included in the
ID, permitted substitutions, how a household finds or obtains the trusted
expected value on a failed console, and whether one image may safely admit more
than one exact assembly.

## Q-177: writer product boundary

Should VCG ship a reviewed fork/integration of Raspberry Pi Imager, or a
separate signed verifier/read-back tool that hands a verified custom image to a
pinned official Imager?

Current conservative contract: generic Imager verification is retained but
does not replace VCG's signature, exact expanded SHA-256, hardware, and
full-device read-back checks. Raw disk commands are not family-facing recovery
instructions.

Needed decision: supported Windows/macOS/Linux versions, tool packaging and
updates, administrator prompts, stable disk identity, system-disk exclusion,
telemetry policy, ZIP decoding ownership, exact verification handoff, and
support horizon.

## Q-178: destructive recovery contents and ceremony

Which optional console-managed content, if any, ships in or is reacquired after
a blank-card recovery, and what exact confirmation communicates permanent local
data loss?

Current conservative contract: the image contains production software and
rights-cleared shipped content only. Profiles, portraits, calibration/body
matching, vault keys, saves, unassigned progress, imports, logs, credentials,
and developer builds are absent and unrecoverable.

Needed decision: production-game and starter-retro inclusion/reacquisition,
first-boot network default, package revocation freshness, wording and physical
confirmation for permanent loss, whether the failed card must be removed
before writing a replacement, and the separately qualified treatment of an old
card that may still contain sensitive encrypted material.
