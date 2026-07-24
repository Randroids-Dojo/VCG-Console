# Owner questions: console accessibility preferences

These decisions are deferred so the prototype can remain useful without
silently choosing final household accessibility policy.

## Q-159: device or player scope

Should text, contrast, reduced motion, input mapping, posture, and audio cues
be device-wide, per local profile, or split between those scopes?

Safe default: keep boot, launcher, recovery, text, contrast, and motion
device-wide so they work before profile selection and for guests. Add optional
per-profile posture, ordinary-action mapping, and cue preferences only after
the protected profile service exists, with an always-reachable device fallback.

## Q-160: remapping authority and recovery

Which ordinary controller actions may be remapped, where should mappings
apply, and what controller-only recovery resets a broken mapping?

Safe default: the native input host owns one guided mapping contract for shell
and consenting games. Never remap or deliver reserved Home, Back, or Pause to a
game. Require an interactive test, conflict detection, generic glyphs, and a
documented hold-at-boot or service-menu reset that does not depend on the
mapping being repaired.

## Q-161: audio-cue product contract

Should non-speech UI cues default on, how should they follow system volume and
mute, and is optional spoken guidance in first-release scope?

Safe default: use sparse local non-speech cues that default on at conservative
volume, always duplicate them with visible text/shape/focus, honor system mute,
and expose a pre-profile Off control. Keep speech optional and offline; do not
add cloud synthesis, voice identity, or microphone use.
