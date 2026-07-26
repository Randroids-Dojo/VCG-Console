# Godot Web Motion bridge resilience evidence

Evidence date: 2026-07-24

Status: one bounded Windows x64 Chrome desk run proves ordered degraded/ready
health and one same-frame reload/reconnect in the actual Godot Web export. It
is a successor to the immutable v1 negotiation/ACK observation, not production
or target qualification.

## Result

The fixture served its existing `MotionBridgeHost` parent from a random
`127.0.0.1` HTTP origin and the byte-pinned Godot export from a distinct random
`localhost` origin. Each child response injected the exact parent origin into
the same frozen, non-writable host configuration; neither child URL had a
query string.

Installed Chrome `150.0.7871.182` observed:

| Phase | Godot source/status | Host evidence |
|---|---|---|
| Initial welcome | `waiting` / `MOTION READY` | one accepted and active session |
| First frame | `motion` / `LANDMARKS ACTIVE` | frame 0 ACKed; zero pending |
| Ordered degraded health | `waiting` / `MOTION OVERLOAD` | health event 1 delivered |
| Ordered ready health | `waiting` / `MOTION READY` | health event 2 delivered |
| Resumed frame | `motion` / `LANDMARKS ACTIVE` | frame 1 ACKed; zero pending |
| Child reload | `waiting` / `MOTION READY` | accepted sessions 2, active/peak 1 |
| Post-reload frame | `motion` / `LANDMARKS ACTIVE` | frame 2 ACKed; zero pending |

The final counts are three published/acknowledged frames, two published health
events, one replacement session, zero invalid ACKs, zero console/page errors,
and one recorded non-fatal aborted WASM fetch. HTML, JavaScript, pack,
WebAssembly, image, and both audio worklet resources were each fetched exactly
twice, once per child document lifecycle.

The generator tolerates only one environment-dependent alternative: Chrome
may report one non-fatal `net::ERR_ABORTED` fetch for `index.wasm` while the
old Godot document is replaced. The tracked run reported that exact one. Any other
request failure or more than one abort fails generation and validation; both
documents must still fetch each core asset and reach the asserted state.

## Evidence boundary

The tracked artifact is
`benchmarks/godot/windows-x64-godot-web-bridge-resilience-v1.json`. It binds
the prior bridge v1 artifact, base 39,867,945-byte Web output, Godot project and
adapter, actual host/protocol/synthetic-frame implementations, successor
fixture, generator, and validator by SHA-256.

This proves authored synthetic health handling and an ordinary iframe reload.
It is not a renderer crash, process kill, OS suspend, session-expiry test,
network interruption, hostile-origin navigation, or repeated soak. The
fixture was not the privileged native package server, signed catalog,
production compositor, or target service manager. There was no camera, real
tracker, participant, physical controller, native Motion IPC, signed
permission admission, target Linux/ARM64 system, or latency measurement.

## Reproduction

Routine validation is offline:

```powershell
pnpm validate:godot-web-bridge-resilience
```

The validator bounds the artifact to 96 KiB and ten mutation tests reject base
evidence substitution, missing degraded/ready state, reload/session overlap,
frame/ACK/pending drift, hidden errors or incomplete repeated fetches,
origin/config/protocol drift, fabricated physical or target evidence, stale
provenance, weakened boundaries, and unknown claims.

The dated live generator requires the exact prior bridge/export artifacts,
their ignored local Web files, installed Chrome, and the current UTC evidence
date:

```powershell
pnpm exec tsx scripts/generate-godot-web-bridge-resilience-evidence.mjs
```

A later engine, browser, source, base artifact, or evidence date requires a
versioned successor rather than rewriting this observation.
