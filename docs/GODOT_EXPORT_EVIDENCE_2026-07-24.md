# Godot Motion sample export evidence

Evidence date: 2026-07-24

Status: Windows desk export and browser-load evidence complete; I-077, I-086,
and Q-058 remain active for live Motion, physical-controller, target, latency,
and engine-comparison evidence.

## Result

The tiny Godot Motion sample now has checked-in release presets for unthreaded
Web, Linux x86-64, and Linux ARM64. One bounded Windows x64 evidence lane:

- verified Godot `4.7.1.stable.official.a13da4feb`;
- verified the official 1,280,486,955-byte standard export-template archive at
  SHA-256
  `86409db6200b6f8fd3230989c2d2002851f3dd18acf11d7bdbafddf5a0dd0f72`;
- verified all 13 installed web and Linux ARM64/x86-64 template files by exact
  byte length and SHA-256;
- emitted release output sets for all three presets twice with identical file
  identities;
- loaded the Web export in installed Chrome `150.0.7871.182`;
- observed the exact initial game state and the expected Left and Jump
  keyboard fallback transitions;
- identified the native outputs as little-endian ELF64 x86-64 and AArch64; and
- booted the x86-64 export headlessly with exit code 0 under WSL2.

This is desk evidence, not target or product qualification.

## Exact outputs

| Preset | Files | Total bytes | Strongest executed evidence |
|---|---:|---:|---|
| Web | 9 | 39,866,665 | HTTP 200 required assets, complete document, 960×540 canvas, bounded game probe, two keyboard fallback actions |
| Linux x86-64 | 2 | 73,489,216 | ELF64 machine 62 and a clean one-second headless WSL2 boot |
| Linux ARM64 | 2 | 67,065,624 | ELF64 machine 183; no execution attempted |

The 18,952-byte project pack is byte-identical across all three targets at
SHA-256
`608c9b1a44b2eb4e62e964d75cbf1fd7099a190aac63d87f699e31b52cdd51ca`.
The complete per-file ledger is in
`benchmarks/godot/windows-x64-godot-4.7.1-export-v1.json`.

Release files remain under ignored `artifacts/godot-motion`; they are not
checked into Git, signed, distributed, or treated as installed packages.

## Browser exercise

The generator serves only the emitted Web files from a random loopback HTTP
port with explicit MIME, COOP, COEP, no-sniff, and no-store response headers.
Chrome returned HTTP 200 for the HTML, JavaScript, pack, and WebAssembly
assets. The document reached `complete` with exactly one 960×540 canvas.

The sample exposes a closed non-authoritative web probe containing only:

- schema version;
- lane;
- stance;
- score;
- input source; and
- status.

The exact transitions were:

| State | Lane | Stance | Score | Source | Status |
|---|---:|---|---:|---|---|
| Initial | 1 | standing | 0 | waiting | `WAITING FOR PLAYER` |
| Arrow Left | 0 | standing | 100 | controller | `CONTROLLER LEFT` |
| Space | 0 | jumping | 200 | controller | `CONTROLLER JUMP` |

These were keyboard events exercising the sample's fallback mapping, not a
physical gamepad or remote. They do not prove controller enumeration,
assignment, labels, reconnect, or reserved Home/Back.

Chrome produced zero console errors and zero page errors. It reported one
`net::ERR_ABORTED` fetch for `index.wasm` even though that required asset also
returned HTTP 200 and the engine reached both interactive probe transitions.
The strict evidence records rather than hides this repeated non-fatal signal;
target browser/network investigation must determine whether it persists.

## Reproduction and validation

The dated live generator requires the exact installed toolchain and WSL2:

```powershell
pnpm exec tsx scripts/generate-godot-export-evidence.mjs
```

Routine verification is offline and does not rebuild the 180 MB output set:

```powershell
pnpm validate:godot-exports
```

The generator refuses another UTC evidence date. A later engine, browser,
kernel, template, source, preset, or output requires a versioned successor
rather than silently rewriting this record.

Ten mutation tests reject template substitution, release-file hash or size
drift, architecture changes, incomplete/substituted browser state, hidden
WASM aborts, fabricated controller/Motion/participant/target evidence, target
or ARM execution promotion, package/latency claims, WSL/browser substitution,
stale source provenance, weakened limitations, and unknown claims.

## Claim boundary

No camera, tracker, Motion frame, participant, physical controller, recovery
remote, native Motion IPC, or live web-bridge negotiation was present. The
loopback page did not run through the production console wrapper or signed
package launcher.

WSL2 is a virtualized same-host observation, not ordinary target Linux. The
ARM64 executable was never run. No GPU/audio behavior, safe area, full-screen,
service-manager ownership, compositor Home/Back, suspend, resource ceiling,
camera-to-action latency, package signing, or update/rollback path was tested.
I-077 and I-086 therefore remain active, and this result is insufficient to
answer Q-058's final Godot-versus-web SDK choice.
