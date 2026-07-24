# Motion web bridge

Last updated: 2026-07-24

`@vcg/motion-web-bridge` is the first cooperative browser transport for the VCG Motion API. It implements D-018 as a reversible `postMessage` boundary for reviewed web games that retain a messaging relationship with the console shell.

It does not make an arbitrary separately launched hosted page motion-capable. D-055 still puts uncontrolled hosted games in supervised top-level browser processes, and the native host or another reviewed injection mechanism must bridge that process boundary later.

## Protocol

1. The game sends `vcg.motion.hello` with bridge protocol version 2, exact Motion API schema version `0.3.0`, a stable client ID, and required/optional capability profiles.
2. The host checks the exact event origin and source before parsing the message.
3. The host creates a session only for that exact bridge/schema pair and replies with `vcg.motion.welcome`, repeating the bound Motion API version and negotiated profiles, or `vcg.motion.rejected` when a required profile is missing.
4. Every `vcg.motion.frame` is validated against the Motion API schema and projected to the profiles granted to that session.
5. The welcome carries current tracker health; ordered `vcg.motion.health` transitions continue even when no frame exists. Frames must match the current health source/status.
6. A repeated hello replaces the prior session for that window. The sample client retries an unanswered handshake and exposes an explicit reconnect operation.
7. A clean client shutdown sends `vcg.motion.goodbye`, allowing the host to discard the session immediately; the console lifecycle must still remove sessions after crashes or navigation.

Unknown fields are ignored on otherwise valid messages so a newer sender can add data without breaking an older receiver. Known fields, message discriminators, and protocol/schema versions remain validated. Unsupported profiles and values are never fabricated.

Bridge protocol v1 and Motion API `0.2.0` or earlier are incompatible with this source snapshot. A v2 host rejects either a legacy hello or a v2 hello naming another Motion schema before it creates a session. A v2 client ignores a legacy welcome or a v2 welcome naming another Motion schema and continues its bounded retry loop. This is exact-version binding, not multi-version negotiation or an implicit migration.

## Security and privacy boundary

- Allowed origins are exact, path-free URL origins. Wildcards and suffix matching are not supported.
- Messages from a non-allowlisted origin are ignored without a response, avoiding a capability oracle for unrelated pages.
- The host verifies both `event.origin` and the source window. The client likewise verifies its configured console origin and target window.
- Clients receive only negotiated profiles. Rich landmarks, world coordinates, and action families are removed unless granted.
- Publication is bounded per session and drops excess frames rather than accumulating a latency-producing queue.
- Health delivery is out of band from frame acknowledgements, uses a closed reason/control vocabulary, and carries no arbitrary provider error text.
- The bridge carries Motion API frames only. Raw camera images, `ImageBitmap` objects, audio, and camera controls are outside the wire schema.
- Action projection follows [the standardized action contract](MOTION_ACTIONS_V1.md): each action belongs to exactly one granted profile, and only `triggered` is side-effecting. Lifecycle feedback remains visible to a client only when that action family was negotiated.

The allowlist identifies an approved web origin; it does not make all code at that origin safe. Package/release authority, content review, CSP, navigation containment, browser permissions, and native Home/Back controls remain separate gates.

The real-browser cross-origin fixture keeps the console and game on distinct exact origins. The console page restricts scripts and frames with CSP; the game page denies every resource class except its same-origin module script and opts into cross-origin embedding with a fixture-scoped `Cross-Origin-Resource-Policy` response. Its iframe grants only `allow-scripts allow-same-origin`. Navigating that same `WindowProxy` to an unapproved origin produces no handshake reply or frame delivery because both inbound origin checks and outbound exact `targetOrigin` remain in force. Returning to the approved origin performs a new hello and replaces the old session before the cooperative client accepts frames.

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
  onHealth(event) {
    // Gate motion control from event.controlAvailability.
  },
  onFrame(frame) {
    // Consume validated landmarks and triggered actions.
  },
});
client.start();
```

A complete typed example lives in `packages/motion-web-bridge/examples/sample-client.ts`.

## Verification scope

Automated tests cover successful and rejected negotiation, legacy bridge and mismatched Motion-schema refusal before session creation, exact-version client retry, welcome-time and ordered out-of-band health, health/frame source-state binding, exact hostile-origin silence, schema validation, profile projection, unknown-field compatibility, clean disconnect, explicit reconnect, retry until a late host appears, per-session frame limiting, and a 10,000-frame burst that remains one delivered frame with no queue. Real Chrome fixtures negotiate through both same-origin and sandboxed cross-origin iframes, receive frames, reconnect after reload, deny an origin-drift handshake and publication, then renegotiate when the allowlisted game returns.

Still required: broader CSP/sandbox/browser-policy combinations, redirects and hostile same-origin code, game stalls, cross-process transport selection, native host integration, and latency measurement on ARM64 and x86-64 Linux.
