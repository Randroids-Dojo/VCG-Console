# Motion SDK authoring guide

Status: runnable web quickstart implemented; Godot quickstart pending

Authority: Motion API 0.3, bridge v2, D-004, D-006, D-059, and I-086

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

## Verification and remaining work

The reference tests prove portable landmark lane input, triggered obstacle
actions, rejection of shell actions as gameplay, deterministic replay through
the same consumer, player-loss handling, and controller recovery. Package
typechecking ensures both the live bridge adapter and replay adapter remain
aligned with the current contracts.

This completes the runnable web half of I-086. It does not close the
investigation: the Godot quickstart, live/replay Godot client, ARM64/x86-64/web
exports, package-size/tooling/latency comparison, and engine choice under Q-058
remain I-077/I-086 work. It also does not replace real-player action
qualification, origin containment, signed permission grants, or native
reserved-control enforcement.
