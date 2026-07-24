# Motion SDK authoring guide

Status: runnable web and Godot quickstarts plus desk export evidence implemented;
target qualification pending

Authority: Motion API 0.4, bridge v2, D-004, D-006, D-059, and I-086

## Start with the contract, not the camera

A game consumes normalized Motion frames and tracker-health events. It never
opens the camera, imports MediaPipe, or receives a provider object. The same
gameplay consumer should accept:

1. live frames from `MotionBridgeClient`;
2. deterministic skeleton-only frames from `MotionTracePlayer`; and
3. controller input when Motion is unavailable or not appropriate.

The runnable TypeScript reference is
`packages/motion-web-bridge/examples/tiny-motion-game.ts`. It keeps one small
state machine behind all three paths and has no dependency on the console UI.

## Live cooperative web connection

The console supplies the reviewed target window and exact console origin. Do
not derive an origin from a query string supplied by an untrusted page.

```ts
import {
  connectTinyLiveGame,
  TinyMotionGame,
} from "./tiny-motion-game";

const game = new TinyMotionGame(render);
const client = connectTinyLiveGame(game, {
  receiver: window,
  target: window.opener,
  targetOrigin: "https://console.example",
  clientId: "my-reviewed-game",
});

// On page teardown:
client.stop();
```

The reference requires only `body.core17` and requests
`actions.obstacle.v1` as optional. This means portable landmark mechanics can
continue when the standardized action profile is unavailable. It does not mean
the client request grants either profile: the console host intersects the
request with manifest-derived permission authority before negotiation.

## Deterministic replay

Use the exact same `TinyMotionGame` instance with a validated skeleton-only
trace:

```ts
import { createTinyGameReplay, TinyMotionGame } from "./tiny-motion-game";
import trace from "./fixture.motion-trace.json";

const game = new TinyMotionGame(render);
const replay = createTinyGameReplay(game, trace);
replay.play();

function animationFrame(now: number) {
  replay.advance(now - previousNow);
  previousNow = now;
  requestAnimationFrame(animationFrame);
}
requestAnimationFrame(animationFrame);
```

`MotionTracePlayer` never reads wall time. Tests can call `advance(0)`,
`advance(100)`, and so on to reproduce the same frame/action ordering without a
camera. Traces declare `containsRawFrames: false` and remain sensitive derived
body data; do not upload them or turn them into telemetry by default.

The TypeScript parser retains legacy trace v1 for existing authored fixtures.
Current console exports use strict v2: bounded core17 x/y frames, stable health
events, trace-local pseudonyms, exact provenance, and explicit
privacy/retention declarations. Validate untrusted exports with
`MotionTraceSchema`; do not infer that a skeleton trace proves physical scene,
floor-contact, exposure-latency, or upstream association causes.

## Frame and action rules

- Parse untrusted values with `MotionFrameSchema` and
  `TrackerHealthEventSchema`. Do not cast network/message objects.
- Use anatomical landmark names, normalized unmirrored image coordinates, and
  declared coordinate metadata. Do not infer provider-specific indices.
- Treat action side effects as edge-triggered: act only on `phase:
  "triggered"`. Started/held/ended/cancelled events are feedback, not duplicate
  gameplay commands.
- Process only the action family the game owns. The tiny reference ignores
  console shell actions even when a test frame contains them.
- Never fabricate an absent landmark, action, profile, player, or Ready state.
- Keep player loss and tracker degradation visible. The tiny reference stops
  Motion control and reports Waiting rather than silently replaying stale
  input.

## Controller fallback

Controller and Motion commands enter the same game state through
`acceptController`. A real game should map the native/browser controller
adapter to its own semantic actions and keep privileged Home/Back outside the
page. Motion degradation must not disable controller recovery.

## Minimal render contract

`TinyMotionGame` emits immutable snapshots:

```ts
interface TinyGameSnapshot {
  lane: 0 | 1 | 2;
  stance: "standing" | "jumping" | "ducking";
  score: number;
  motionReady: boolean;
  inputSource: "controller" | "motion" | "waiting";
  status: string;
}
```

Rendering is deliberately outside the consumer. DOM, Canvas, WebGL, Godot, and
native renderers can map this state without changing Motion authority or test
fixtures.

## Godot 4.7 quickstart

The matching project is `examples/godot-motion-game`. It keeps the same
consumer boundary in GDScript:

- `VcgTinyMotionGame` validates the portable core, consumes normalized hip
  landmarks, triggers only obstacle `triggered` actions, ignores shell
  actions, fails visible on loss, and accepts controller recovery;
- `VcgMotionReplay` advances a legacy-v1 skeleton-only `vcg-motion-trace` from
  an injected elapsed clock and rejects raw-frame or unordered input; and
- `VcgMotionWebBridge` binds a Godot web export to exact bridge v2/Motion 0.4
  welcome, health, frame, session, origin, and acknowledgement fields.

The reviewed console origin must come from host-owned package configuration.
The sample deliberately rejects path-bearing origins and does not read an
origin from a page query string. It requires `body.core17`, requests
`actions.obstacle.v1` as optional, and acknowledges only an exact sequence
after the game consumer accepts the frame.

Validate the sample with Godot 4.7:

```powershell
pnpm validate:godot
```

The validator runs three GDScript contract tests, imports and parses the
complete project, and boots the main scene. Set `GODOT_BIN` when the executable
is not on `PATH`. The reference scene demonstrates controller fallback while
keeping Home and Back platform-owned.

There is intentionally no native Godot transport adapter yet. I-074 must select
and measure a local IPC transport before native Godot can receive live Motion
data; an unauthenticated ad hoc socket would bypass the permission and
backpressure work already established by the web bridge.

## Verification and remaining work

The TypeScript tests prove portable landmark lane input, triggered obstacle
actions, rejection of shell actions as gameplay, deterministic replay through
the same consumer, player-loss handling, and controller recovery. Package
typechecking ensures both the live bridge adapter and replay adapter remain
aligned with the current contracts.

The Godot headless tests independently cover all 17 portable landmark names,
triggered-versus-held semantics, shell-action exclusion, controller recovery,
deterministic replay, raw-frame denial, unsafe-origin denial, and non-web
live-bridge denial.

The checked-in Godot release presets now produce unthreaded Web, Linux x86-64,
and Linux ARM64 outputs with exact Godot 4.7.1 templates. The dated Windows
desk record pins all output hashes and sizes. Installed Chrome loads the web
build to the closed six-field `__vcgGodotExportProbe`, then Left and Jump
keyboard fallback produce the expected game states. The x86-64 ELF boots
headlessly under WSL2; the ARM64 ELF has the expected AArch64 identity but was
not executed.

Run the offline evidence gate:

```powershell
pnpm validate:godot-exports
```

This advances both quickstart source paths for I-086 but keeps the
investigation active until a real physical controller and reviewed Motion
bridge negotiate with the export, target ARM64/x86-64 execution is observed,
and the tooling and camera/landmark/action latency comparison is recorded
under I-077/Q-058. Neither sample replaces real-player action qualification,
signed permission grants, target origin containment, or native
reserved-control enforcement.
