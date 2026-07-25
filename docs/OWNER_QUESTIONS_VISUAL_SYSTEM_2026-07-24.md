# Owner questions: visual token system

These questions do not block the bounded v1 software contract. They block
claiming I-148 or I-206 complete and block treating the current palette,
motion, sound, or illustration behavior as release-approved.

## VTS-001: Shippable accent choices

Should the product expose cyan, amber, and violet, or ship only cyan until
target-TV and accessibility testing qualifies additional choices? If multiple
accents ship, decide whether selection is per console, per local profile, or
admin-only.

Current safe default: cyan only. The other exact values are bounded testable
candidates, not approved user-facing options.

## VTS-002: Fault color exception

Should critical faults retain the existing red-orange semantic color as a
reserved exception to the monochrome-plus-one-accent direction, or should
faults use the active accent with stronger shape, icon, pattern, and copy?

Current implementation preserves the existing fault hue and never treats it
as a configurable accent. Release approval is outstanding.

## VTS-003: Sound-cue vocabulary

Which non-speech cues are required for focus movement, confirmation, denial,
tracking loss, recovery, launch readiness, and destructive confirmation?
Specify asset provenance, loudness/mixing ceilings, repetition rules,
controller/headphone behavior, default state, mute behavior, and a complete
visual/haptic alternative for every cue.

Current state: the accessibility preference can disable audio cues, but no
release sound vocabulary or qualified assets exist.

## VTS-004: Illustration language

What bounded illustration style supplies child-friendly warmth without
weakening the terminal hierarchy or introducing ungoverned colors? Identify
the required setup, empty-state, recovery, safety, and community-review
illustrations plus rights/provenance requirements.

Current state: geometric CSS marks are implementation fixtures, not an
approved illustration system.

## VTS-005: Motion ceilings

Are the v1 80/120/180/1,200 ms timing classes acceptable starting candidates,
and which effects may use the ambient class? Define the target-TV comfort,
vestibular, comprehension, and GPU gates and whether any state must remain
fully static even when reduced motion is not requested.

Current safe boundary: reduced-motion paths collapse every animation to one
non-repeating 0.01 ms iteration; the standard timings are unqualified.

## VTS-006: Target review protocol

Confirm the selected televisions, seating distances, room lighting, age
groups, low-vision/color-vision coverage, controller-only tasks, and
pass/fail thresholds for I-206 and the remaining Q-077 font work.

Current state: Windows headless-Chrome captures and computed contrast ratios
are regression evidence only.
