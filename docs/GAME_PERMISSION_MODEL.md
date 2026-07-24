# Game permission model

Last updated: 2026-07-24

VCG game permissions are an explicit, deny-by-default launch contract. A public
manifest can request only the closed vocabulary in `vcg-game.json` v1. Parsing
a manifest does not grant authority: the host derives a separate permission
grant, rejects incoherent declarations, and configures runtime boundaries from
that grant.

This preserves the v1 compatibility contract. The parser continues to accept
every previously valid v1 shape, while a declaration that cannot be enforced
safely fails before it becomes launch or Motion authority. Tightening the
parser itself or adding a new permission value still requires a new manifest
schema version.

## V1 vocabulary

| Manifest value | Requested authority | Current enforcement |
|---|---|---|
| `gamepad` | Game-scoped controller input | Declared input only; native SDL3 routing remains unqualified |
| `pointer` | Pointer input | Browser/runtime containment remains unqualified |
| `keyboard` | Keyboard input | Browser/runtime containment remains unqualified |
| `touch` | Touch input | Declared input only |
| `motion.core17` | Session-local player presence plus the portable 17-landmark skeleton | Maps exactly to Motion profile `body.core17` |
| `motion.actions.obstacle` | Standardized jump, duck, and dodge events | Maps exactly to `actions.obstacle.v1`; also requires `motion.core17` and input profile `motion.obstacle.v1` |
| `network` | Game network access consistent with its declared required/optional network class | Offline manifests are rejected if present; non-offline launch grants fail if absent |
| `persistent-storage` | Game/profile-scoped durable storage | Bounded native namespace/quota/unlink planning and an explicit durable exact-scope reset primitive exist; ordinary runtime broker and filesystem/mount enforcement remain future host work |

There is no implicit permission. Unknown extension fields remain advisory and
cannot add authority. Duplicate manifest values do not multiply a grant.

## Deliberately unavailable requests

The following are not v1 permission values and are rejected by the closed enum:

- raw camera video or still images;
- microphone or other audio capture;
- identity, portrait, body-profile, calibration-vault, or household-profile
  access;
- presence-only Motion data;
- MediaPipe 33-landmark, world-coordinate, segmentation, hand, or depth
  profiles; and
- console-owned shell actions such as Home, Back, Pause, or profile selection.

Presence-only is intentionally unavailable rather than implemented by silently
overgranting a skeleton. Motion API `0.3.0` frames represent a player with the
complete core skeleton, so `motion.core17` is the minimum current Motion grant.
A future presence-only wire shape requires a new reviewed Motion profile and a
new manifest permission version.

`motion.actions.obstacle` cannot be action-only for the same reason: current
Motion frames always carry the core skeleton. The grant derivation therefore
requires both motion permissions and the corresponding input profile.

The selected camera may contain a microphone, but D-046 keeps audio capture
disabled at the OS boundary by default. The browser tracker requests
`audio: false`; neither the Motion schema nor bridge can transport pixels or
audio.

## Grant derivation and Motion enforcement

Parse first, then derive authority:

```ts
import {
  deriveGamePermissionGrant,
  parseGameManifest,
} from "@vcg/game-manifest";

const manifest = parseGameManifest(input);
const grant = deriveGamePermissionGrant(manifest);
```

Derivation fails when network mode and permission disagree, when obstacle
actions omit the core skeleton, or when the obstacle permission and input
profile do not appear together.

A cooperative Motion host must receive an explicit profile grant:

```ts
const host = new MotionBridgeHost({
  receiver,
  allowedOrigins: [reviewedOrigin],
  capabilities: trackerCapabilities,
  authorizedProfiles: grant.motionProfiles,
  initialHealth,
});
```

The host refuses to exist without an authorized and available `body.core17`
profile. It intersects tracker capabilities with the explicit grant before
advertising them. A required ungranted profile rejects negotiation; an optional
ungranted profile is reported unavailable. Frame projection then removes
ungranted rich/world data and action families. A source tracker having a richer
capability does not make that capability game-visible.

Games with no `motion.core17` grant must not receive a Motion host at all.
Origin approval and profile authorization are both required; neither implies
the other.

## Disclosure contract

Before a production install or launch can be called permission-complete, its
review screen must list requested capabilities in plain language:

- body skeleton and body actions separately;
- network as Required or Optional;
- local persistent storage;
- direct pointer, keyboard, touch, and controller inputs; and
- a redundant statement that camera video and microphone are unavailable to
  the game.

Permission changes are release changes. Installed packages must bind the exact
manifest through signed catalog evidence; an unknown field or live website
change cannot add a permission. Family mode, revocation, per-profile choices,
and any future prompt must fail closed and cannot convert a denied v1 value
into authority.

The current desk prototype defines and tests this disclosure contract but does
not yet render a signed install/launch permission review or enforce every
native/browser device boundary. The save lifecycle planner closes I-100's
design artifact without creating a writable mount. Those implementation gaps
remain under I-102, I-115, I-141, I-189, I-191, I-150, and I-209.

## Verification boundary

Automated tests prove:

- raw-video and microphone strings fail v1 parsing;
- incoherent network and motion declarations cannot derive a grant;
- exact v1 motion permissions map only to the two current game-visible Motion
  profiles;
- a host cannot start without authorized core skeleton access;
- tracker capabilities outside the grant are absent from delivered frames;
- required profile escalation rejects the session; and
- ordinary same-origin and sandboxed cross-origin fixtures work with explicit
  core-only grants.

This closes the I-079 vocabulary and cooperative-bridge enforcement artifact.
It does not qualify OS sandboxing, network namespaces/firewalling, persistent
storage isolation, signed permission review UI, native games, or uncontrolled
hosted pages. Q-055 remains open for those product-wide enforcement and
disclosure results.
