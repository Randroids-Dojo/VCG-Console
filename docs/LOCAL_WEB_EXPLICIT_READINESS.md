# Local-web explicit readiness

Last updated: 2026-07-25

Status: version-1 cooperative protocol implemented; production host adapter
and target qualification remain open

## Purpose and claim boundary

Bundled local-web games need a stronger launch signal than process survival or
`document.readyState`. The implemented protocol lets one exact game instance
say that its own bounded initialization phase is starting, ready, degraded, or
failed in response to a fresh host challenge.

This is cooperative in-page readiness. It does not prove that the page is
honest, visible, focused, controller-routable, fullscreen, contained,
responsive after the challenge, correct for gameplay, or recoverable. A
qualified host must compose it with package identity, browser supervision,
compositor/window ownership, reserved Home/Back, controller routing,
watchdog, and process cleanup.

## Version-1 handshake

`@vcg/motion-web-bridge` now exports `LocalWebReadinessHost` and
`LocalWebReadinessClient`.

The host:

1. selects the exact local-web target window and its exact HTTPS origin or
   exact HTTP loopback origin (`localhost`, `127.0.0.1`, or `[::1]`);
2. binds game ID, version, manifest SHA-256, and a host-issued runtime
   instance ID;
3. creates a fresh 32-to-96-character high-entropy challenge ID;
4. fixes a 1,000-to-120,000 ms monotonic expiry;
5. attaches its listener before sending the challenge; and
6. accepts status only from the exact target object and origin.

The client already knows its compiled game ID, version, and manifest digest.
It ignores a challenge for another release. A fresh accepted challenge emits
sequence zero `starting`; the game may then publish only the closed phase and
reason combinations.

| Phase | Allowed reason |
|---|---|
| `starting` | `none` |
| `ready` | `none` |
| `degraded` | `recovering`, `dependency-unavailable`, `performance` |
| `failed` | `initialization-failed`, `incompatible-release`, `runtime-error` |

The legal phase graph is:

```text
waiting -> starting -> ready <-> degraded
                    \-> failed
ready/degraded ------> failed
```

`failed`, `expired`, and `stopped` are terminal for that host object. Every
accepted status must echo the exact runtime, release, manifest, instance, and
challenge binding and use the next contiguous sequence. One challenge accepts
at most 64 transitions.

## Expiry, retry, and restart

The expiry is derived from the host monotonic clock; no game wall clock or
game-supplied timestamp is trusted. At the exact deadline, the host reports
`expired` even if it had briefly observed `ready`. Production launch
coordination must consume a current ready result before expiry rather than
persisting it as durable health.

If the initial challenge was sent before the game installed its listener, the
host may resend the same challenge while still waiting. The client treats that
retransmission idempotently. Once a replacement runtime instance starts, a
new challenge ID invalidates status from the earlier challenge. Stop removes
listeners and clears challenge authority.

## Privacy and containment

Both wire objects are strict closed schemas. They contain no:

- profile ID, display name, portrait, player/session assignment, or body data;
- save, progress, account, credential, token, payment, or service payload;
- URL, path, filename, command, environment, process, or package location;
- free-form status, exception, diagnostic, or user-authored text; or
- Motion frame, landmark, action, camera, microphone, or controller data.

The game cannot choose the target origin, runtime identity, expiry, instance,
or challenge. Wrong-origin and sibling-window messages are silently ignored.
Valid-looking cross-release, cross-instance, stale-challenge, duplicate,
skipped-sequence, and illegal-phase messages do not change readiness.

This protocol is independent of Motion negotiation. A game does not need
Motion access to report readiness, and obtaining readiness does not grant
Motion, browser, storage, network, native, profile, or launch authority.

## Executable coverage

The package has 36 tests total, including eleven local-readiness groups:

- exact starting/ready release binding;
- degraded recovery and terminal failure;
- hostile origin/window and cross-release refusal;
- contiguous sequencing and the closed phase graph;
- host and client monotonic expiry;
- replacement-challenge replay refusal;
- lost-initial-message retransmission and client idempotence;
- unknown-field, free-text, private-data, runtime, and reason confusion
  rejection;
- the exact 64-transition ceiling;
- unsafe identity, weak challenge, remote cleartext origin, path-bearing
  origin, and clock-rollback refusal; and
- listener removal and authority clearing on stop.

Run:

```sh
pnpm --filter @vcg/motion-web-bridge typecheck
pnpm --filter @vcg/motion-web-bridge test
```

The Console Lab cross-origin Chrome fixture composes the readiness protocol
with the existing Motion iframe exercise. It proves that a host on
`http://127.0.0.1:4173` can bind a game on `http://localhost:4173`, observe
starting and ready, observe a bounded degraded/recovered sequence, invalidate
the old challenge when the iframe navigates to a hostile origin, and establish
a fresh challenge only after the expected game origin returns. This is
development-browser evidence, not a production host qualification.

## Remaining I-099 work

The protocol is not yet wired to a production local-package server, browser
wrapper, native host, launcher, or compositor. Still required:

- a CSPRNG-backed host instance/challenge producer and collision/reboot
  policy;
- exact signed package/manifest and browser-process binding;
- the selected readiness producer point inside each reviewed game or wrapper;
- compositor visibility/focus plus controller and reserved-input composition;
- timeout, retry, crash, suspend/resume, update/rollback, and stale-window
  behavior;
- bounded launcher failure projection;
- target ARM64 and ordinary Linux x86-64 evidence; and
- production-host proof against a deliberately dishonest, hung, hidden, or
  replaced page.

Native/Godot and Libretro readiness remain separate adapters. Hosted HTTP
health remains the credentialless transport boundary documented in
`PRIVACY_SAFE_CATALOG_HEALTH.md`.

Owner decisions are isolated in
[`OWNER_QUESTIONS_LOCAL_WEB_READINESS_2026-07-25.md`](OWNER_QUESTIONS_LOCAL_WEB_READINESS_2026-07-25.md).
