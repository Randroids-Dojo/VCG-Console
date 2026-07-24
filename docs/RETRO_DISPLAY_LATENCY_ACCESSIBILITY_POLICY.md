# Retro display, latency, rewind, and accessibility policy

Status: conservative host baseline implemented; target/core profiles unqualified

Date: 2026-07-24

This document advances I-132 without treating optional RetroArch features as
universal improvements. VCG owns the selected configuration. Ordinary players
do not receive raw shader, latency, rewind, driver, or override menus.

## Implemented baseline

The host-generated append configuration now explicitly sets:

```text
preemptive_frames_enable = "false"
rewind_enable = "false"
run_ahead_enabled = "false"
video_frame_delay = "0"
video_frame_delay_auto = "false"
video_hard_sync = "false"
video_shader_enable = "false"
video_threaded = "false"
```

These entries override a base configuration that might otherwise acquire
frontend defaults or package-local choices. They establish a reproducible
no-enhancement baseline; they do not claim that the remaining base
video/audio/driver configuration is qualified.

The upstream evidence supports a fail-closed default:

- [Run-Ahead](https://docs.libretro.com/guides/runahead/) requires clean,
  sufficiently fast save states and additional CPU headroom. Too many frames
  can visibly stutter or roll back, and second-instance mode has different
  performance and audio behavior.
- RetroArch's
  [optimal VSync guidance](https://docs.libretro.com/guides/optimal-vsync/)
  says frame delay, run-ahead, preemptive frames, hard GPU sync, swap-chain
  depth, audio latency, shaders, threaded video, renderer, refresh rate, and
  display behavior interact. It recommends changing one factor at a time and
  reducing or disabling advanced latency settings when smooth frame pacing
  suffers.
- The official
  [troubleshooting guide](https://docs.libretro.com/guides/troubleshooting-retroarch/)
  names disabling shaders and run-ahead as low-frame-rate responses, describes
  threaded video's synchronization/latency cost, and warns that hard GPU sync
  can consume enough headroom to turn smooth output into poor performance.
- Shader language depends on the video driver. Libretro recommends Slang when
  supported and GLSL for OpenGL/OpenGL ES contexts; see the
  [shader introduction](https://docs.libretro.com/shader/introduction/) and
  [driver compatibility table](https://docs.libretro.com/development/shader/shader-overview/).
- The official
  [CRT shader catalog](https://docs.libretro.com/shader/crt/) describes
  `crt-pi` and `crt-potato` as low-cost candidates but also records
  resolution/hardware limitations. That is candidate evidence, not VCG target
  qualification.
- The current
  [FinalBurn Neo documentation](https://docs.libretro.com/library/fbneo/)
  recommends single-instance run-ahead or preemptive frames for that core and
  separately notes a possible conflict when rewind is active. Core-specific
  advice therefore cannot authorize a global setting.
- RetroArch's current source defaults and comments are visible in
  [`config.def.h`](https://github.com/libretro/RetroArch/blob/master/config.def.h):
  rewind consumes memory, frame delay and hard sync trade headroom for
  latency, and threaded video trades synchronization and latency for
  performance.

## Product policy

### One exact authority

Any non-baseline profile must be bound to all of:

- target ID, architecture, hardware fingerprint, OS image, display mode,
  renderer, frontend version/hash, core version/hash, and exact content hash;
- exact host policy revision and generated configuration hash;
- shader preset source/version/hash, license, language, renderer compatibility,
  pass count, parameters, and auxiliary texture hashes when a shader is used;
- save-state capability and determinism evidence for run-ahead, preemptive
  frames, or rewind;
- the performance campaign and raw telemetry hashes defined by
  `RETRO_PERFORMANCE_BENCHMARK_CONTRACT.md`; and
- controller, audio, visual/accessibility, save-integrity, suspend/resume, and
  clean-exit evidence.

Changing any bound identity returns to the baseline until the profile is
requalified. A public manifest, user preference, filename, preset name, or
untrusted RetroArch configuration is not authority.

### Mutual exclusions and bounds

- Run-ahead and preemptive frames are alternative state-replay engines. VCG
  enables at most one.
- Rewind remains off whenever either latency state-replay engine is active
  until their exact combination has separate correctness evidence. The first
  qualification campaign must not combine them.
- Frames are selected per core and content from measured native input lag.
  VCG never guesses a frame count from system generation.
- Second-instance run-ahead is a distinct profile with separate CPU, memory,
  audio, suspend, and shutdown evidence.
- Frame delay, hard GPU sync, swap-chain limits, audio-buffer changes,
  renderer changes, shaders, and threaded video are tested independently
  before any combined profile.
- Shader and rewind hotkeys, next/previous preset actions, raw override save,
  configuration persistence, and online shader acquisition remain disabled.

### Accessibility boundary

The always-available reduced-effects path is the no-shader baseline. A
qualified visual preset must never be the only way to read status, focus,
warnings, prompts, or gameplay-critical information.

Every shader profile needs a documented review of:

- flashing, rolling scan effects, temporal subframes, black-frame insertion,
  rapid brightness changes, and photosensitivity risk;
- contrast, black crush, bloom, blur, phosphor persistence, curvature,
  geometric distortion, crop, overscan, color dependence, and small-detail
  loss;
- TV-distance legibility and interaction with the console's high-contrast,
  large-text, and reduced-motion preferences; and
- an immediate controller-reachable return to the no-shader profile.

Rewind can be an accessibility assist, but it changes challenge and timing.
When qualified, its availability and effect on scores, achievements, replays,
and save-state expectations must be visible. It cannot silently alter
competitive comparison. VCG-owned Home/Back and pause/exit remain available
regardless of every emulation feature.

## Candidate target recommendations

These are campaign starting points, not shipped settings.

| Target lane | Visual starting point | Latency starting point | Rewind starting point |
|---|---|---|---|
| Linux ARM64 / Raspberry Pi 5 reference | No shader at native qualified output. Evaluate one pinned lightweight GLSL/Slang preset only at the exact renderer and resolution; do not inherit Pi 4 or 1080p claims as Pi 5/4K proof. | Baseline first. Evaluate one frame of exactly one state-replay engine only for low-cost, deterministic cores after full-speed headroom and state tests. Keep frame delay, hard sync, and threaded video unchanged during that comparison. | Off. Measure state size, memory bandwidth, storage/save interaction, power, and thermals before choosing a bounded buffer. |
| Linux x86-64 reference | No shader first. Evaluate one pinned Slang preset on the selected renderer, then a lightweight accessibility-reviewed alternative. Heavy multi-pass CRT simulation is optional and never a release requirement. | Baseline first. Compare one-frame single-instance run-ahead against preemptive frames per core/content; test second instance separately. Prefer stable frame/audio output over a lower synthetic latency number. | Off during latency-engine qualification. Later evaluate a bounded profile separately, with deterministic state and session-integrity evidence. |

Neither lane enables black-frame insertion, shader subframes, automatic frame
delay, raw user presets, or global rewind by default.

## Qualification sequence

For each exact target/core/content/display/controller combination:

1. Capture the no-enhancement baseline and prove full-speed output, audio
   stability, saves/states, suspend/resume, exit, and reserved controls.
2. Measure native internal input lag with repeatable frame-advance or external
   input-to-photon instrumentation.
3. Change one feature only. Repeat the full frame, audio, power, thermal,
   crash, and hang campaign rather than reporting average FPS alone.
4. For state-replay features, test state creation/load determinism, audio
   discontinuity, rollback artifacts, nondeterministic cores, disk/media
   changes, multiplayer, and long sessions.
5. For shaders, verify exact preset closure and licensing, compile/cache
   behavior, every target renderer/resolution, screenshots plus instrumented
   frame pacing, and the accessibility review above.
6. Run combined profiles only after their components pass independently.
7. Record known limits and retain the baseline as automatic recovery. A
   feature failure disables that feature; it does not silently select another
   core, renderer, preset, or frame count.

## Remaining evidence

No physical Raspberry Pi 5 or x86-64 target was tested by this tranche. No
frontend/core/shader artifact was downloaded. There is no selected renderer,
display mode, preset, frame count, rewind buffer, per-title UX, physical
input-to-photon result, photosensitivity review, or signed installed-policy
field. The host currently implements only the explicit conservative baseline.
