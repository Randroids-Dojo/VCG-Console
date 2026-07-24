# Device-only profile portrait capture

Last updated: 2026-07-24

Status: camera-free synthetic lifecycle rehearsal implemented; real portrait
capture, storage, deletion, exclusion, household, and legal qualification
remain disabled

Authority: D-002, D-016, D-045, D-081, D-082, D-083, D-085, D-086, I-072,
I-134, I-184, I-185, I-186, I-187, and I-188

## Claim boundary

The console lab now rehearses the deliberate portrait lifecycle without
capturing a person. It uses geometric synthetic fixtures and opaque render
handles. The screen:

- shows a dedicated notice before a visible three-second countdown;
- labels the camera off and the fixture synthetic;
- creates one temporary preview only after the countdown;
- focuses but never automatically activates Use Portrait;
- discards the temporary handle on Retake, Back, Home, cancel, or expiry;
- replaces one prior synthetic handle only after explicit acceptance; and
- supports controller and triggered shell-motion Select/Back through the same
  launcher input path.

The implementation does not call `getUserMedia`, request camera permission,
receive a frame, encode an image, write browser storage, write the profile
vault, delete a real portrait, or claim legal consent. A synthetic accepted
handle is volatile launcher state and disappears on reload.

This is executable policy evidence for D-082. It is not implementation or
qualification of D-081/D-083/D-085.

## Non-negotiable invariants

1. No join, tracking, calibration, diagnostic, screenshot, game, or background
   frame can become a profile portrait.
2. A capture begins only from the selected profile's dedicated management
   screen after notice.
3. Camera-active UI and the hardware activity indicator precede and cover the
   real capture interval. The synthetic rehearsal says Camera Off instead.
4. Exactly one bounded still may be committed per profile. The original
   capture frame, burst, thumbnail cache, and rejected previews do not persist.
5. Preview is temporary. Retake destroys it before another countdown. Back,
   Home, cancel, timeout, error, shutdown, or process loss never promotes it.
6. Acceptance names the selected opaque profile ID and exact temporary render
   handle. A stale session, attempt, revision, or replacement state fails.
7. Portrait pixels, crops, perceptual hashes, facial landmarks, embeddings,
   classifiers, and appearance features never enter calibration or automatic
   body-profile matching.
8. Games, hosted pages, diagnostics, logs, support bundles, recovery images,
   backups, export, migration, cloud, saves, and developer tooling receive no
   portrait bytes or reusable portrait handle.
9. Profile deletion, profile reset, factory reset, vault loss, storage loss,
   destructive reflash, migration, and console replacement do not restore or
   substitute a portrait. A later profile needs a fresh deliberate capture.
10. A name, body match, current player, controller assignment, or portrait
    similarity never authenticates replacement or deletion.
11. Real capture stays disabled until the selected hardware, vault,
    camera/indicator lease, deletion, exclusion, household notice/consent,
    security/privacy review, and applicable legal review pass.

## Synthetic state machine

```text
idle
  |
  | explicit selected-profile entry
  v
notice --------------------------------------------+
  |                                                |
  | Start rehearsal                               | Back/Home/cancel/expiry
  v                                                |
countdown -- exact session + attempt + 3 seconds   |
  |                                                |
  | matching synthetic callback after deadline    |
  v                                                |
preview -------------------------------------------+
  |              |
  | Retake       | Use portrait
  |              |
  +--> countdown +--> revision-bound commit --> idle
```

Each session has a bounded 120-second lifetime, monotonic session ID, attempt
number, exact profile ID, countdown deadline, and at most one temporary handle.
A retake increments the attempt, invalidating late completion from the prior
attempt. The controller refuses time rollback.

The acceptance plan contains exactly:

| Field | Meaning |
|---|---|
| `kind` | Fixed `accept-portrait` operation |
| `expectedRevision` | Exact current in-memory state |
| `sessionId` | Exact active session |
| `attempt` | Exact preview-producing attempt |
| `profileId` | Selected opaque profile |
| `temporaryRenderHandle` | Exact preview handle |
| `replacedRenderHandle` | Current accepted handle or null |

Unknown fields, unsafe IDs, data URLs, paths, arbitrary handles, early
completion, stale callbacks, mismatched previews, changed replacement state,
and stale revision fail closed.

## Current data boundary

The browser model accepts only handles matching the explicit synthetic
`portrait-fixture-*` vocabulary. It contains no byte array, Blob, data URL,
file path, MIME type, dimensions, EXIF, camera ID, face rectangle, feature
vector, network destination, or storage location.

The accepted projection is a bounded sorted list of:

```text
opaque profile ID -> opaque synthetic render handle
```

The launcher uses the handle only to select a geometric CSS fixture. The
profile tile and preview state the image is synthetic. This avoids collecting
household imagery while the lifecycle and input behavior are still changing.

## Required production shape

The following is the planned boundary to qualify, not current code:

1. The launcher requests a portrait session for one opaque profile through the
   profile broker. It never supplies a path or image.
2. The broker obtains an exclusive camera lease. Tracking and calibration stop
   or move to a separately reviewed non-capturing state; games cannot hold the
   camera concurrently.
3. The physical activity indicator and camera-active UI become true before
   frames enter the portrait capture process. The UI never claims a shutter
   position unless selected hardware provides a trustworthy sensor.
4. A privileged monotonic countdown and the compositor-visible countdown bind
   the same session and attempt.
5. Raw frames remain inside the narrow capture process/GPU boundary. The shell
   receives an approved local render capability, not raw bytes.
6. At the capture instant, the broker derives one fixed-policy still, strips
   all source metadata, validates dimensions/encoding, closes the source
   frame, and creates an encrypted temporary vault record.
7. Preview rendering is profile/session/operation scoped, non-exportable, and
   revocable. Retake/cancel/expiry destroys the temporary record and key.
8. Accept atomically installs the temporary record as the profile's sole
   portrait, advances protected manifest state, and cryptographically deletes
   the replaced portrait only after the new commit is durable.
9. Deletion/reset/factory-reset transactions remove render authority and
   portrait keys before reporting completion.
10. The I-186 producer canary and materialized-artifact verifier prove absence
    from every prohibited producer and output.

Exact encoding, crop, resolution, camera lease, temporary-record recovery, and
hardware indicator behavior remain Q-180 through Q-182 and target evidence.

## UI and input behavior

The dedicated screen has four visible states:

| State | Primary information | Available operations |
|---|---|---|
| Notice | Identifiable-image warning, synthetic/camera-off status, exclusions, real-family gate | Start or Cancel |
| Countdown | Large 3/2/1, synthetic status, cancel-without-save copy | Cancel |
| Preview | Temporary/not-saved label, synthetic image, camera/recognition/storage status | Use, Retake, Cancel |
| Idle fallback | No session active | Return to Profiles |

The currently focused Use choice may be activated by controller Select or a
triggered hands-together action. Focus alone has no effect. Controller Back,
crossed-arm Back, Home, route change, search entry, launcher hide, cancellation,
and session expiry all discard the current temporary handle. All choices use
ordinary focusable buttons with visible focus and at least 44-pixel targets.

## Threat model

### Assets

- a person's identifiable portrait;
- linkage from portrait to household profile;
- temporary raw frame and derived encoded still;
- encryption keys and render capabilities;
- notice/consent and deletion state; and
- camera/indicator truth.

### Trust boundaries

```text
Camera/driver
    |
    v
Narrow portrait capture process -----> encrypted temporary vault record
    |                                         |
    | opaque preview capability               | atomic accepted record
    v                                         v
Launcher compositor                      Profile vault broker
    |
    +---- no portrait capability ----> games / hosted pages / diagnostics
```

The current desk rehearsal implements only the launcher-side state machine
with synthetic handles. The camera, capture process, temporary encrypted
record, broker capability, and real deletion paths do not exist.

### Attacker and failure stories

| ID | Story | Required prevention/evidence |
|---|---|---|
| PT-01 | A background tracking frame is promoted without notice. | Capture API accepts only a dedicated broker session/attempt; source and dependency test excludes tracker frame objects. |
| PT-02 | Early or late callbacks overwrite another attempt. | Exact session/attempt/revision binding; retake and cancellation revoke prior attempt; adversarial callback tests. |
| PT-03 | Back or Home visually exits but a delayed callback saves. | Cancel commits revocation before navigation; delayed completion rejected; process and power-loss tests. |
| PT-04 | A game or hosted page invokes capture or fetches a handle. | Caller-specific broker ACL; no game permission vocabulary; hostile process/origin tests. |
| PT-05 | Portrait pixels enter diagnostics, backup, recovery, support, save, logs, crash dump, swap, or network. | Producer canaries, trusted materialization, path-free evidence, RAM/swap/crash/network inspection under I-186. |
| PT-06 | Facial analysis is added as a convenient dependency. | Separate package/dependency graph; static import/field canaries; security review rejects image/face inputs to matching. |
| PT-07 | Cancelled/retaken plaintext persists in temp files, thumbnails, GPU caches, or old vault generations. | No generic image viewers; encrypted temporary record; key destruction; forensic/power-loss/storage tests. |
| PT-08 | Replacing a portrait deletes the old one before the new record is durable. | Create-new temporary record, manifest-before-protected-state commit, then old-key deletion; interruption at every boundary. |
| PT-09 | A shared-TV observer learns household membership. | Q-179 decides visibility; household observation/usability test; do not claim privacy from people in the room. |
| PT-10 | A sibling/guest replaces another person's portrait accidentally or maliciously. | Explicit management entry, selected profile and replacement scope, deliberate confirmation, motion false-positive and household abuse tests; Q-182. |
| PT-11 | Activity UI says off while the camera is active, or claims shutter state without a sensor. | Broker-owned exclusive lease and hardware indicator tests; software copy distinguishes power/activity/shutter truth. |
| PT-12 | Storage/vault loss restores a stale placeholder that looks current. | Empty visible state and fresh capture only; no portrait recovery image or backup; loss/reflash/replacement tests. |
| PT-13 | Crafted encoded image exploits decoder/render path. | Fixed maintained decoder, strict size/format/dimension limits, metadata stripping, fuzzing, malformed corpus, sandboxed rendering. |
| PT-14 | Session clock rollback extends an abandoned preview or replays consent. | Monotonic bounded session/attempt state; expiry and time-rollback tests; no consent inference from old state. |

### Current mitigations and limits

The synthetic controller already enforces PT-01 through PT-04 and PT-14 at the
launcher-policy level without handling pixels. The browser flow proves no
`getUserMedia` call occurs in the simulator-backed rehearsal. That is not proof
against another process, browser/driver cache, crash dump, or future real
adapter. PT-05 through PT-13 remain production gates.

## Negative-propagation matrix

| Destination | Portrait data allowed? | Current evidence | Production evidence still required |
|---|---:|---|---|
| Profile vault accepted record | One approved still | No real store | Encrypted broker commit, deletion, rollback/power-loss |
| Temporary preview store | One revocable still | Synthetic handle only | Encrypted temp record, expiry/retake/cancel destruction |
| Launcher | Approved local render capability | Synthetic CSS fixture | Non-exportable scoped capability and hostile-shell review |
| Matching/calibration | No | Separate synthetic controller/schema | Static/runtime canaries and dependency review |
| Game/hosted page | No | No portrait API or field | Native/web sandbox and capability tests |
| Save/unassigned progress | No | Separate models | Producer canaries and materialized real saves |
| Diagnostics/log/support | No | No byte field; existing diagnostic exclusions | Real producer canaries, crash/log/support artifacts |
| Backup/export/migration/cloud | No | No operation or destination | Complete service/network/archive inventory |
| Recovery/system image | No | Recovery contract excludes profiles | Exact shipped bundle and raw-image scan |
| Developer mode | No production portrait access | Synthetic fixture only | Broker stopped/locked; clean family-mode reboot test |

## Verification evidence

Nine pure Vitest cases prove:

- empty identity-minimized frozen state;
- explicit notice and complete countdown before preview;
- exact attempt matching and early/stale callback refusal;
- one accepted handle per profile and replacement disposition;
- Retake invalidation and temporary-handle discard;
- Back-style cancellation without promotion and preservation of the old image;
- bounded expiry without acceptance;
- forged/unknown commit, data URL, path, unsafe ID, excessive-count, and
  backwards-time refusal; and
- no acceptance from notice, countdown, cancellation, or display-name
  similarity.

The Chrome flow proves:

- the dedicated notice/countdown/preview screens;
- a visible synthetic/camera-off boundary;
- zero `getUserMedia` calls in the camera-free simulator path;
- preview focus without automatic acceptance;
- controller Back cancellation with no profile change;
- controller acceptance;
- Retake followed by hands-together acceptance of a distinct replacement;
- Home cancellation preserving the accepted portrait; and
- visible synthetic treatment on the profile tile without horizontal overflow
  at the 520-pixel setup viewport.

The production bundle and zero-warning Svelte typecheck cover the integrated
screen. A reviewed 1440 by 1000 screenshot records the temporary preview.

## Remaining qualification

I-185 remains active. Before any real portrait or family beta:

- resolve Q-179 through Q-183 and existing Q-075/Q-099;
- obtain the qualified privacy/security/legal reviews for selected
  jurisdictions and child/household use;
- select exact encoding/crop/resolution/metadata policy and maintained decoder;
- implement the native exclusive camera/indicator lease and raw-frame
  confinement;
- implement encrypted temporary and accepted vault records plus protected-state
  ordering;
- integrate credential-free profile management, replacement, profile
  deletion/reset, factory reset, and vault/storage loss;
- inject portrait canaries into every I-186 prohibited producer and artifact;
- prove no face/appearance dependency or matching input;
- test real controller/motion false positives, siblings/guests, simultaneous
  players, TV-distance comprehension, accessibility, and consent withdrawal;
- test capture/retake/cancel/accept under crash, kill, power loss, full disk,
  update/rollback, time rollback, and malformed images on both targets; and
- retain non-photographic profile art as the safe release fallback.
