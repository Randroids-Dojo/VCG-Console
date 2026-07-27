# Launcher visible-text Unicode hardening - 2026-07-26

Status: deterministic launcher intake hardening implemented; localization,
homoglyph review, and physical controller qualification remain open

Authority: I-142, I-151, I-185, I-188, and I-190

## Boundary repaired

Three launcher-visible data paths used independent partial control-character
checks and JavaScript UTF-16 code-unit length:

- local profile names, profile details, and linked game titles;
- unassigned-progress game titles, slot labels, and progress summaries; and
- browser-provided controller identifiers rendered in connection status.

All three now share one fail-closed helper. It rejects C0/C1 controls, isolated
UTF-16 surrogates, non-ASCII whitespace, soft hyphen, Arabic letter mark,
Mongolian vowel separator, zero-width and bidirectional formatting controls,
interlinear annotation controls, shorthand and musical controls, and Unicode
language-tag/tag controls. Ordinary ASCII space and visible NFC text remain
available.

Profile names retain the existing explicit trim-and-NFC behavior, but unsafe
raw characters are rejected before trimming so a byte-order mark or non-ASCII
space cannot disappear during normalization. The declared 24-, 32-, 48-,
96-, and 256-character ceilings now count Unicode scalars instead of UTF-16
code units.

This does not add names or controller metadata to the native host launch
registry. That registry remains an opaque-profile-ID boundary.

## Evidence

The helper test enumerates every code point in each rejected range, including
all surrogate values and tag characters, and separately covers every singleton
format control. It also proves non-ASCII whitespace rejection, ordinary Latin,
CJK, emoji, and ASCII-space acceptance, and astral scalar counting.

Profile-management, unassigned-progress, and gamepad-router tests inject six
representative unsafe values through every affected visible field. Boundary
tests prove exactly 24 emoji profile-name scalars, 48 emoji game-title scalars,
and 256 emoji controller-ID scalars are accepted while the next scalar is
rejected.

No raw input reports, controller descriptors, profile body data, portraits,
save payloads, paths, credentials, or free-form diagnostic text were added to
evidence.

## Claim limit

This is an enumerated invisible/control-character boundary, not a complete
Unicode spoofing or confusable-character defense. It does not establish
localization policy, script-mixing rules, rendered-glyph legibility, browser
Gamepad API trust, native SDL identity, controller compatibility, physical
input behavior, profile-vault persistence, or target-platform qualification.
Those remain under their existing product, accessibility, controller, profile,
and target evidence gates.
