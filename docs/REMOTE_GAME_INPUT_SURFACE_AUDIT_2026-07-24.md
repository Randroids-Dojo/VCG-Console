# Remote game input-surface audit

Evidence date: 2026-07-24

Status: neutral synthetic API observation; I-089 remains open

Qualification result: zero input-qualified games

## Outcome

All 26 catalog URLs loaded in fresh headless Chrome contexts while an injected
standard-mapped Gamepad API fixture exposed four neutral axes and 17 unpressed
buttons. No button, key, pointer, touch, form, permission, login, or game action
was performed.

During the bounded initial-route window:

- VibeBots, VibeRacer, Bone Cleaver, GoPit, and GoDig polled or registered for
  the Gamepad API;
- 25 titles registered a keyboard event signal;
- 21 registered a pointer/mouse/wheel signal;
- 19 registered a touch signal;
- 12 exposed an input, textarea, or contenteditable surface;
- no title requested pointer lock or fullscreen without interaction;
- no title made a mutating HTTP request; and
- zero titles received an input qualification.

The authoritative current artifact is
[`remote-game-input-surface-observation-v2.json`](../compliance/game-input/remote-game-input-surface-observation-v2.json).
Its 26 records are bound by SHA-256
`81dae4f12644140f6fb1a58a37e7238c0bd07be21e48df65cd22d5c797be1dd2`
and bind the exact remote-offline v2 format/digest. The v1 input artifact
remains immutable historical evidence.

## Claim boundary

This is an API-surface observation, not a controller test. A page can poll a
neutral gamepad but map buttons incorrectly, ignore ordinary controls, require
a pointer for menus, trap focus, fail after launch, or capture Back/Home. A
page can also register framework-level keyboard, click, pointer, input, or
touch listeners without exposing those controls to players.

The injected fixture never produces a press, release, axis movement, vibration,
battery state, disconnect, replacement, or multi-controller event. The single
`gamepadconnected` event is synthetic and untrusted. Poll counts are not
performance measurements because page initialization time varies.

No physical controller, remote, television, target Linux compositor, audio
path, pointer lock, fullscreen transition, gameplay, pause, exit, crash, or
recovery was exercised.

## Exact procedure

For every title, installed Google Chrome `150.0.7871.182` ran in a new 1920 x
1080 context. Before page scripts, the observation fixture:

1. wrapped `addEventListener` to count a closed set of keyboard, pointer, touch,
   input, change, click, wheel, and gamepad listener registrations;
2. exposed a standard gamepad at index 0 with neutral axes and unpressed
   buttons;
3. counted `navigator.getGamepads()` calls;
4. counted spontaneous pointer-lock and fullscreen requests;
5. navigated to the exact catalog URL and waited for `DOMContentLoaded` plus
   four seconds;
6. dispatched one neutral `gamepadconnected` event and waited 250 ms;
7. counted initial DOM canvases, controls, text-entry surfaces, and focusable
   elements; and
8. destroyed the context.

Only counts, booleans, title, and query-free URLs are retained. Listener
functions, DOM text, form values, request paths/bodies, console messages,
cookies, storage values, identifiers, and user data are excluded.

## Catalog-wide signal matrix

`G` is a Gamepad API poll/listener signal. `K`, `P`, and `T` are keyboard,
pointer, and touch listener/property signals. `Text` means an initial input,
textarea, or contenteditable element was present. None of these columns is a
required-input or playability declaration.

| Game | G | Polls | K | P | T | Text |
|---|---:|---:|---:|---:|---:|---:|
| VibeBots | Yes | 250 | Yes | Yes | Yes | — |
| VibePinball | — | 0 | Yes | Yes | Yes | — |
| VibeRacer | Yes | 89 | Yes | Yes | Yes | — |
| VibePins | — | 0 | Yes | Yes | — | Yes |
| Bone Cleaver | Yes | 200 | Yes | Yes | — | Yes |
| Vibeman (Hangman) | — | 0 | Yes | — | — | — |
| Asymptotic Bitrot | — | 0 | Yes | Yes | Yes | Yes |
| Fracking Asteroids | — | 0 | Yes | Yes | Yes | — |
| Hoops | — | 0 | Yes | Yes | Yes | Yes |
| Mi Casa Es Su Casa | — | 0 | Yes | Yes | Yes | Yes |
| Block Punch Kick | — | 0 | Yes | Yes | Yes | — |
| Epoch | — | 0 | Yes | Yes | Yes | — |
| GameTape | — | 0 | Yes | — | — | Yes |
| GoPit | Yes | 50 | Yes | Yes | Yes | Yes |
| Block-You | — | 0 | Yes | Yes | Yes | Yes |
| Determined | — | 0 | Yes | — | — | — |
| SoftwareDevSim | — | 0 | Yes | Yes | Yes | — |
| Baby Piano | — | 0 | Yes | Yes | Yes | — |
| Clankers | — | 0 | — | — | — | — |
| VibeCity | — | 0 | Yes | Yes | Yes | Yes |
| Flatline | — | 0 | Yes | Yes | Yes | — |
| VibeGear2 | — | 0 | Yes | Yes | Yes | — |
| Text Racer | — | 0 | Yes | — | — | Yes |
| Drop Dead Keep | — | 0 | Yes | Yes | Yes | Yes |
| Streamer Billboard | — | 0 | Yes | Yes | Yes | — |
| GoDig | Yes | 137 | Yes | Yes | Yes | Yes |

Bone Cleaver, GoPit, and GoDig registered `gamepadconnected` listeners and
polled. VibeBots and VibeRacer polled without an observed connection listener.
The other 21 did not touch the fixture during the initial window; they can
still initialize controller support only after a start action or later route.

## Text-entry surface details

The 12 initial-route text-entry signals were:

- VibePins: 3 inputs;
- Bone Cleaver: 42 inputs;
- Asymptotic Bitrot: 1 input;
- Hoops: 1 input and 1 textarea;
- Mi Casa Es Su Casa: 1 input and 1 textarea;
- GameTape: 2 inputs;
- GoPit: 1 contenteditable surface;
- Block-You: 1 input;
- VibeCity: 1 input;
- Text Racer: 1 input;
- Drop Dead Keep: 1 textarea; and
- GoDig: 1 contenteditable surface.

Their purpose and whether ordinary gameplay requires text are unverified. A TV
release needs either a controller-accessible console text-entry path or a
truthful pre-launch keyboard requirement.

## Error boundary

Eighteen titles emitted at least one console-error message during the
instrumented window; none emitted a Playwright `pageerror`. Messages are
deliberately not retained because arbitrary hosted text can contain URLs,
identifiers, or secrets.

This count cannot distinguish an existing deployment error from a benign
resource warning or an incompatibility with the injected fixture. It is a
follow-up locator, not a pass/fail result. Physical qualification should
capture a separately redacted stable error classification with game-owner
review.

## Fail-closed interpretation

- Prioritize physical controller testing for the five titles with Gamepad API
  signals, but do not call them controller-compatible.
- Do not reject the other 21 solely because the initial route did not poll.
- Treat keyboard, pointer, touch, and text-entry signals as possible living-room
  blockers until ordinary play is demonstrated without them or the
  requirement is disclosed.
- Keep reserved Home, Back, pause, forced exit, focus recovery, and watchdog
  authority outside every hosted page.
- Keep every input field in the full catalog candidate ledger unverified and
  every reviewed-device array empty.

## Remaining qualification

I-089 still requires a hands-on per-game session with:

- representative standard and ambiguous physical controllers;
- controller-only start, menus, ordinary play, pause, retry, details, and exit;
- exact button/axis mapping and glyph behavior;
- keyboard, pointer, touch, and text-entry dependency checks;
- connect-before-launch, hot-plug, disconnect, reconnect, replacement, battery,
  sleep/wake, and multiple-controller behavior;
- pointer-lock and fullscreen transitions;
- console-owned Home/Back/long-X behavior under load, focus loss, hang, and
  crash;
- 720p, 1080p, 4K, physical TV, target Linux, Steam/Pi tiers, and audio; and
- a reviewed manifest update only after the required devices and fallbacks are
  known.

Owner decisions are isolated in
[`OWNER_QUESTIONS_REMOTE_GAME_INPUT_2026-07-24.md`](OWNER_QUESTIONS_REMOTE_GAME_INPUT_2026-07-24.md).

## Reproduction and validation

The live generator contacts all 26 hosted URLs:

```text
node scripts/generate-remote-game-input-surface-evidence.mjs
```

Deterministic validation:

```text
node scripts/validate-remote-game-input-surface-evidence.mjs
node --test scripts/validate-remote-game-input-surface-evidence.test.mjs
```

The validator binds the current catalog/offline v2 inventory and digest,
requires the exact environment, canonical UTC timestamp, and 26 identities,
closed listener/handler/gamepad/control counts, derived signals, zero mutating
requests, zero qualifications, a game-record digest, derived summary, exact
limitations, and bounded canonical UTF-8 JSON.
Eight adversarial test groups prevent inventory substitution, qualification or
signal promotion, fabricated observations, unsafe captured data, mutating
requests, provenance/environment/digest/summary drift, unknown fields, and
encoding/size violations.
