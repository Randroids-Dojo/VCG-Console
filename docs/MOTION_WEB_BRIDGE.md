# Motion web bridge

Last updated: 2026-07-19

`@vcg/motion-web-bridge` is the first cooperative browser transport for the VCG Motion API. It implements D-018 as a reversible `postMessage` boundary for reviewed web games that retain a messaging relationship with the console shell.

It does not make an arbitrary separately launched hosted page motion-capable. D-055 still puts uncontrolled hosted games in supervised top-level browser processes, and the native host or another reviewed injection mechanism must bridge that process boundary later.

## Protocol

1. The game sends `vcg.motion.hello` with protocol version 1, a stable client ID, and required/optional capability profiles.
2. The host checks the exact event origin and source before parsing the message.
3. The host replies with `vcg.motion.welcome` and the negotiated profiles, or `vcg.motion.rejected` when a required profile is missing.
4. Every `vcg.motion.frame` is validated against the Motion API schema and projected to the profiles granted to that session.
5. A repeated hello replaces the prior session for that window. The sample client retries an unanswered handshake and exposes an explicit reconnect operation.
6. A clean client shutdown sends `vcg.motion.goodbye`, allowing the host to discard the session immediately; the console lifecycle must still remove sessions after crashes or navigation.

Unknown fields are ignored on otherwise valid messages so a newer sender can add data without breaking an older receiver. Known fields, message discriminators, and protocol/schema versions remain validated. Unsupported profiles and values are never fabricated.

## Security and privacy boundary

- Allowed origins are exact, path-free URL origins. Wildcards and suffix matching are not supported.
- Messages from a non-allowlisted origin are ignored without a response, avoiding a capability oracle for unrelated pages.
- The host verifies both `event.origin` and the source window. The client likewise verifies its configured console origin and target window.
- Clients receive only negotiated profiles. Rich landmarks, world coordinates, and action families are removed unless granted.
- Publication is bounded per session and drops excess frames rather than accumulating a latency-producing queue.
- The bridge carries Motion API frames only. Raw camera images, `ImageBitmap` objects, audio, and camera controls are outside the wire schema.
- Action projection follows [the standardized action contract](MOTION_ACTIONS_V1.md): each action belongs to exactly one granted profile, and only `triggered` is side-effecting. Lifecycle feedback remains visible to a client only when that action family was negotiated.

The allowlist identifies an approved web origin; it does not make all code at that origin safe. Package/release authority, content review, CSP, navigation containment, browser permissions, and native Home/Back controls remain separate gates.

## Game integration

The game must receive the exact console window and console origin from its reviewed launch configuration. It must not infer a target origin from an untrusted query parameter or use `"*"`.

```ts
const client = new MotionBridgeClient({
  receiver: window,
  target: consoleWindow,
  targetOrigin: "https://console.example",
  clientId: "obstacle-game",
  request: {
    requiredProfiles: ["body.core17", "actions.obstacle.v1"],
    optionalProfiles: ["body.world3d"],
  },
  onFrame(frame) {
    // Consume validated landmarks and triggered actions.
  },
});
client.start();
```

A complete typed example lives in `packages/motion-web-bridge/examples/sample-client.ts`.

## Verification scope

Automated tests cover successful and rejected negotiation, exact hostile-origin silence, schema validation, profile projection, unknown-field compatibility, clean disconnect, explicit reconnect, retry until a late host appears, per-session frame limiting, and a 10,000-frame burst that remains one delivered frame with no queue. A real Chrome fixture also negotiates through an iframe, receives a frame, reloads the game document, reconnects, and receives the next frame.

Still required: cross-origin CSP and sandbox combinations, hostile navigation, game stalls, cross-process transport selection, native host integration, and latency measurement on ARM64 and x86-64 Linux.
