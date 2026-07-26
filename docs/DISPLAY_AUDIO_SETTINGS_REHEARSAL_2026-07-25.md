# Display and audio settings rehearsal — 2026-07-25

Status: controller-first browser rehearsal implemented; native services and
physical TV/audio qualification remain open

Authority: D-008, I-108

## Purpose

The launcher Settings view now has explicit Display and Audio sections instead
of leaving those I-108 categories implicit. The implementation demonstrates
controller navigation, bounded state, safe-area copy, and a local cue while
refusing to present browser guesses as television or audio-hardware facts.

This is not a display-mode, audio-routing, calibration, or persistence service.
It changes no operating-system setting and qualifies no television, HDMI path,
receiver, speaker, channel layout, microphone boundary, or target platform.

## Closed rehearsal state

`AvSettingsRehearsalController` exposes only:

- a hidden or visible 5% action-safe preview guide; and
- a quiet or standard level for the next short local cue.

Its immutable version-1 snapshot also fixes the evidence boundary:

- persistence is `session-only`;
- display output identity is `not-enumerated`;
- signal mode and HDR are `not-reported`;
- overscan is `unqualified`;
- audio output is `system-default-unverified`;
- channel layout is `not-tested`;
- microphone state is `not-requested`; and
- no native service is connected and no hardware setting is applied.

Reload restores the safe defaults: hidden guide and standard cue level. The
controller rejects values outside the closed vocabulary.

## Display boundary

The 5% guide changes only a box inside the Settings preview. It does not inset
the launcher, change resolution or refresh rate, set HDR/color behavior, alter
the compositor, detect overscan, or prove that critical content is visible on a
physical television. Existing deterministic screenshot geometry remains desk
evidence only.

A production implementation needs an authenticated native display service and
must distinguish requested mode, compositor-applied mode, HDMI/EDID observation,
and physical-TV confirmation. A failed or unconfirmed change needs a bounded
automatic rollback that remains operable by controller.

## Audio boundary

The test button creates one short `AudioContext` oscillator cue and sends it to
the browser's system-default destination. Quiet and standard change only the
cue's local gain envelope. The UI does not enumerate an output, change system
volume, infer HDMI/receiver/speaker presence, or claim stereo or surround
behavior.

The flow never requests media capture. Microphone disablement at Raspberry Pi
OS, SteamOS, and Windows boundaries remains I-179; the words `NOT REQUESTED`
describe this browser flow only and are not operating-system proof.

## Evidence completed

- Four unit cases prove exact defaults, bounded transitions, complete reset,
  detached frozen snapshots, and rejection of open runtime values.
- A real Chrome flow uses synthetic standard gamepad Select to reveal the
  display guide and choose the quiet cue, confirms Back returns to the launcher,
  and observes zero `getUserMedia` calls.
- The browser suite and source-bound OCR/TV evidence must remain green after the
  new panels and search entries are included.

The unresolved product decisions and recommended safe defaults are recorded in
`docs/OWNER_QUESTIONS_DISPLAY_AUDIO_SETTINGS_2026-07-25.md`.
