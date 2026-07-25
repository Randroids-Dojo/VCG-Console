# Motion coordinate frames 0.1.0

Status: working contract

Contract version: `0.1.0`

Last updated: 2026-07-22

This specification defines what game code may infer from image, player-relative, floor, and optional provider-world coordinates. It prevents camera placement, mirroring, body scale, and backend-specific 3D output from silently changing game behavior.

## Capability declaration

Every Motion frame declares:

- `coordinateSpecVersion: "0.1.0"`;
- `coordinateSystem: "image.normalized.top-left"`;
- `worldCoordinateSystem` only when `body.world3d` is present.

Version `0.1.0` permits one world declaration: `player.metric.hip-origin.provider-axes`. The runtime parser and exported JSON Schemas require that declaration exactly when the world profile is advertised.

## 1. Image frame: `image.normalized.top-left`

| Property | Definition |
|---|---|
| Origin | Top-left corner of the unmirrored inference image |
| +x | Right in the inference image |
| +y | Down in the inference image |
| Nominal extent | `x=0..1`, `y=0..1`, normalized by image width and height |
| Units | Unitless |
| Outside-frame points | Allowed; inferred or partially visible landmarks may be below 0 or above 1 |
| z | Optional provider depth. It is not a floor coordinate and has no cross-backend scale guarantee in this profile. |

The capture/inference image is never mirrored before landmark mapping. A selfie-style preview may mirror only its final presentation. Landmark names remain the player's anatomical left/right, so a person facing the camera normally has anatomical right on the image's left side.

MediaPipe's current documentation defines normalized x/y by image width/height, normalized z with hip depth as origin and smaller values closer to the camera, and world values in meters with hip midpoint as origin. It does not establish a VCG floor frame or a cross-provider axis contract. See [Google's Pose Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/android).

Use the image frame for screen overlays, visibility/bounds, and inputs that deliberately follow camera composition. Do not use raw image displacement as a body-scale-independent dodge or jump measurement.

## 2. Player-relative frame

The player-relative 2D frame is derived from four observed image landmarks:

- left and right hips;
- left and right shoulders.

| Property | Definition |
|---|---|
| Origin | Midpoint of left/right hips |
| +x | Orthogonalized direction from anatomical left hip toward anatomical right hip |
| +y | Direction from hip midpoint toward shoulder midpoint (body-up) |
| Scale | Image distance from hip midpoint to shoulder midpoint |
| Units | Torso lengths |

Construction:

1. Normalize the hip-to-shoulder vector as +y.
2. Remove its projection from the left-to-right hip vector.
3. Normalize the remaining hip vector as +x.
4. Project a landmark's hip-origin displacement onto each axis and divide by torso scale.

The orthogonalization removes body roll from the local axes. Translation and uniform image scaling cancel. `createPlayerRelativeBasis`, `imageToPlayerRelative`, and `playerRelativeToImage` are the normative TypeScript reference.

The frame is unavailable when required anchors are unobserved, non-finite, coincident, or too foreshortened to form stable axes. Callers must retain the prior confirmed state briefly or degrade/pause according to the action profile; they must not substitute zero coordinates or a guessed body scale.

Use this frame for body-relative reach, lean, squat proportions, and left/right motion. Because its origin moves with the hips, it cannot independently prove a jump or absolute room position.

## 3. Floor frame

The calibrated floor frame is metric and room-stable:

| Property | Definition |
|---|---|
| Origin | Floor point directly below the calibrated camera center |
| +x | Camera-right along the floor |
| +z | Away from the camera into the play area |
| Units | Meters |
| Transform | Versioned image-to-floor 3×3 homography produced by room calibration |

`imageToFloor` applies homogeneous perspective division and rejects non-finite matrices or a point whose denominator is effectively zero. Calibration owns the matrix, source image geometry, camera orientation, validity confidence, and invalidation triggers. The function does not invent a floor plane.

The floor frame is unavailable until calibration passes. It must be invalidated after camera movement, resolution/crop changes, camera replacement, or a failed floor-confidence check. A game that requires it declares that requirement and degrades explicitly when unavailable.

Use the floor frame for play-zone boundaries, room-relative steps, player spacing, and ground-referenced jump/floor contact after those algorithms are qualified.

## 4. Optional provider-world frame

`player.metric.hip-origin.provider-axes` means:

- coordinates are provider-reported meters;
- the origin is the detected player's hip midpoint;
- axis orientation and model assumptions remain those of the named backend adapter;
- the frame moves with the player and is not a room/floor frame;
- games may consume it only after negotiating `body.world3d`.

This conservative name is intentional. MediaPipe documents meter units and hip origin, but current VCG evidence does not qualify axis parity against Hailo, RTMO, ONNX, or another backend. An adapter must not relabel provider output as a future canonical right/up/away frame without measured conversion evidence.

Use provider-world values for backend-qualified body proportions or relative 3D mechanics. Do not compare them across backends, persist them as room calibration, or use them for leaderboard normalization in version `0.1.0`.

## Transform and conformance rules

- All public transform inputs and outputs must be finite.
- Degenerate player bases and points at homography infinity fail explicitly.
- Player-relative image round trips must agree within floating-point tolerance.
- Translation, uniform scale, and body roll must not change player-relative coordinates beyond tolerance.
- A bridge projection that removes `body.world3d` must also remove every `worldPosition` and `worldCoordinateSystem` field.
- Unknown future coordinate versions or identifiers fail negotiation/schema validation rather than falling back silently.
- Bounds use the same unmirrored image frame and may extend outside the nominal image rectangle.

## Adapter obligations

Every capture/tracker adapter records:

1. whether input pixels were rotated, cropped, letterboxed, or mirrored before inference;
2. the exact mapping back to the declared image frame;
3. whether normalized z exists and its provider semantics;
4. whether world output exists, its units/origin/axes, and conversion evidence;
5. which calibration produced a floor homography and when it expires;
6. parity tests against the same conformance fixtures used by other backends.

The current MediaPipe adapter declares the conservative provider-world
identifier. The Hailo pre-wire projection accepts only an explicitly versioned
already-normalized top-left image-coordinate input; it does not infer
coordinates from an unpinned Hailo runtime object and exposes no world
coordinates. Raw Hailo post-processing conversion, honest Motion-frame source
versioning, and cross-backend world-axis parity remain open under I-073/I-161.
