# Console accessibility preferences

Status: versioned device-wide launcher prototype implemented; native input,
tracker, game-runtime, target-TV, and household qualification remain open.

Last updated: 2026-07-24

## Purpose and scope

Accessibility must be available before profile selection or game launch. The
console lab therefore exposes one device-wide prototype preference document
under Settings / Access. It does not require admin or developer mode and
contains no profile identity, diagnosis, free text, or privileged action.

Three preferences affect the current shell:

- `textScale` changes the root type scale from the standard browser scale to
  the provisional 112.5% large scale;
- `contrast` replaces the charcoal palette with a provisional black/white,
  brighter-accent palette and strengthens focus with outline, spacing, and
  underline cues; and
- `motion` either follows the operating-system reduced-motion preference or
  suppresses nonessential CSS motion explicitly.

Three additional controls are honest integration demonstrations:

- `seatedPlay` records standard or seated-preferred posture;
- `confirmButton` records South/A or West/X as an ordinary-confirm preview;
  and
- `audioCues` enables or disables a short local Web Audio confirmation cue.

Seated preference and confirm remapping are not consumed by the tracker,
browser input router, native input host, or games. Their panel says so
directly. Reserved Home, Back, and Pause are outside remapping.

## Closed persistence contract

The prototype uses the key `vcg.accessibility.v1` and stores exactly:

```json
{
  "schemaVersion": 1,
  "textScale": "standard",
  "contrast": "standard",
  "motion": "system",
  "seatedPlay": "standard",
  "confirmButton": "south",
  "audioCues": "on"
}
```

The complete UTF-8 document is capped at 1,024 bytes. Unknown, missing,
out-of-vocabulary, malformed, oversized, or wrong-version state is ignored in
full and conservative defaults are used. There is no partial migration or
unknown-field carry-forward. Runtime changes are revalidated before writing.

Rejected stored state remains inert and is disclosed separately from a clean
default. If browser storage cannot be read or written, preferences remain
usable for the current session and the UI says they are volatile. Reset
removes the complete key and reapplies every default. Browser local storage is
only a desk prototype; a native settings service must eventually own durable
appliance state and migration.

## Defaults and safety properties

| Preference | Default | Current effect | Boundary |
|---|---|---|---|
| Text | Standard | Shell/root type scale | Provisional until TV-distance testing |
| Contrast | Standard | Shell palette and redundant focus | Provisional until low-vision/color-vision review |
| Motion | System | Honors OS reduced-motion setting | Explicit Reduced is also available |
| Posture | Standard | Stored/displayed only | Does not claim seated body-play support |
| Confirm | South / A | Stored/displayed only | Router remains canonical; reserved inputs immutable |
| Audio | On | User-triggered local sine cue preview | Visual/text cues remain complete when Off |

Changing this document cannot enable administration, developer pairing,
native launch, camera access, game permission, profile selection, or package
authority. It is intentionally separate from the sensitive profile vault.

## Input and recovery evidence

Every option is an ordinary focusable button in the launcher's shared
keyboard/controller path. The Chrome test activates Large and Reset using a
synthetic standard controller's South/A button and returns Home using
controller Back. It deliberately selects the West/X preview, reloads, then
proves South/A still activates Reset: preview data cannot silently alter the
current router.

Reset remains reachable under large text, high contrast, and reduced motion.
The settings panel identifies the persisted, default, or volatile state
without relying on color alone.

## Automated evidence

Six unit tests prove:

- no-write conservative defaults;
- exact versioned round-trip and the byte cap;
- rejection of malformed, oversized, unknown-field, wrong-version, and
  out-of-vocabulary documents;
- usable volatile behavior under read/write/remove failures;
- invalid runtime-change rejection and complete reset; and
- explicit root attributes for every preference.

The real Chrome flow proves:

- standard defaults before any write;
- larger computed root type;
- high-contrast and explicit reduced-motion application;
- honest seated/remap disclosures;
- local audio Off and On behavior;
- exact stored bytes;
- restoration across reload;
- controller activation and Back recovery; and
- complete reset with key removal.

The reviewed screenshot is
`test-results/console-lab/accessibility-settings.png`.

## Remaining qualification

I-119 is `active`, not closed. Still required:

- owner decisions in
  `OWNER_QUESTIONS_ACCESSIBILITY_2026-07-24.md`;
- native persistent storage, schema migration, update/rollback behavior, and
  reset scope;
- native SDL3/remap propagation and a guided recovery mapping that can never
  steal reserved controls;
- tracker/calibration and manifest-mediated game propagation;
- actual seated and limited-range play evidence under I-068;
- non-speech and optional speech/audio design, volume/mute integration, and
  hearing-accessibility review;
- screen-reader/semantic, zoom, low-vision, color-vision, switch/one-handed,
  cognitive, and controller-only household testing; and
- 720p/1080p/4K safe-area and seating-distance tests on both target tiers.

The current 112.5% scale, colors, labels, and cue are test values, not a final
accessibility certification.
