# Godot Web Motion bridge evidence

Evidence date: 2026-07-24

Status: one bounded Windows x64 Chrome desk run proves the actual Godot Web
export can negotiate and consume synthetic Motion across distinct loopback
origins. This is not production or target qualification.

Successor note: `GODOT_WEB_BRIDGE_RESILIENCE_EVIDENCE_2026-07-24.md`
separately exercises degraded/ready health and reload/reconnect without
rewriting this v1 observation.

## Result

The fixture built the real console-lab host against the existing
`MotionBridgeHost`, served it from a random `127.0.0.1` HTTP origin, and
embedded the byte-pinned Godot export from a distinct random `localhost`
origin. The child response injected the exact parent origin into a frozen,
non-writable `globalThis.__vcgGodotMotionHostConfig`; the child URL had no
query string.

Installed Chrome `150.0.7871.182` observed:

| Check | Exact result |
|---|---:|
| Accepted/active sessions | 1 / 1 |
| Bridge / Motion schema | 2 / 0.4.0 |
| Published / acknowledged frames | 2 / 2 |
| Pending frames after each publication | 0 |
| Invalid acknowledgements | 0 |
| Godot input/status after frame | `motion` / `LANDMARKS ACTIVE` |
| Console / page / request errors | 0 / 0 / 0 |
| Physical controllers / participants / target hardware | 0 / 0 / 0 |

The synthetic frames use `body.core17`; they do not contain camera data or
prove a tracker. The first live attempt exposed a real adapter defect:
Godot's JSON parser represented the integral `sequence` as a float while the
consumer required `TYPE_INT`, so the frame was silently rejected. The adapter
now accepts only finite, non-negative, exactly integral values through the
Motion schema's JavaScript-safe maximum, normalizes them to a GDScript integer,
and acknowledges only after successful consumption. Headless tests cover both
the accepted boundary and negative, fractional, non-finite, and string values.

## Evidence boundary

The exact tracked artifact is
`benchmarks/godot/windows-x64-godot-web-bridge-v1.json`. It binds the base
39,867,945-byte Web output, project/adapter sources, actual host and protocol
implementations, fixture, generator, and validator by normalized SHA-256.

The fixture's HTTP server supplied host configuration. It was not the
privileged native package server, signed installed-catalog authority, or
production compositor. Both origins were same-host loopback. There was no
physical controller, camera, real tracker, participant, native Motion IPC,
signed permission admission, package lifecycle, target Linux/ARM64 run, or
latency measurement. Reconnect, degraded health, stall expiry, origin
navigation, hostile same-origin code, and recovery controls remain untested in
this Godot lane.

## Reproduction

Routine validation is offline:

```powershell
pnpm validate:godot-web-bridge
```

It validates the bounded artifact and runs ten mutation tests that reject
origin/config/query drift, bridge or Motion version substitution,
session/frame/ACK/pending changes, missing Godot state application, hidden
browser errors, fabricated physical evidence, production/permission/target or
latency promotion, stale provenance, weakened boundaries, and unknown claims.

The dated live generator requires the exact Godot export evidence, installed
Chrome, and current UTC evidence date:

```powershell
pnpm exec tsx scripts/generate-godot-web-bridge-evidence.mjs
```

A later browser, engine, source, host implementation, export identity, or
evidence date requires a versioned successor rather than silently rewriting
this observation.
