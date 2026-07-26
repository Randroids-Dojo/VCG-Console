# Skeleton-trace debugging evidence

Date: 2026-07-24

Status: bounded v2 trace export and automated blind-to-truth synthetic
exercise implemented; independent debugging, real-camera cause attribution,
retention policy, and target qualification remain.

## Outcome

Skeleton traces are useful debugging evidence, but they do not reproduce every
class of tracking defect adequately.

An eight-case automated exercise received only a neutral case ID, one closed
reported-symptom code, and a minimized core17 trace. The truth reveal was
committed separately and scored after triage:

| Reported symptom | Trace result | Root cause identified | Defensible conclusion |
|---|---|---:|---|
| Unexpected action | Full reproduction | Yes | The trace proves a Jump was authorized while the required lower-body observations and player confidence were unsafe. |
| Left/right inversion | Symptom only | No | A simultaneous hip/shoulder axis reversal is visible, but the trace cannot distinguish a provider name swap from a mirror/turn/adapter cause. |
| Player swap | Symptom only | No | Trace-local tracks jump between positions, but post-association output cannot prove which upstream association step failed. |
| Floor-contact mismatch | Insufficient | No | Portable core17 image coordinates contain neither qualified floor truth nor an independent contact reference. |
| Latency regression | Insufficient | No | Capture-arrival timestamps cannot establish camera-exposure latency. |
| Landmark loss | Symptom only | No | The missing/low-visibility wrist is visible, but blur, occlusion, crop, lighting, and provider behavior remain indistinguishable. |
| Tracker dropout | Full reproduction | Yes | The bounded stable health history carries the exact `camera-disconnected` cause without exception text. |
| No-defect control | Control | N/A | No finding or root-cause claim was emitted. |

All seven defect symptoms were detected. Two of seven roots were identifiable,
three retained only the symptom, and two lacked the physical/timestamp
evidence required to reproduce the claim. The control produced no false
positive.

This is evidence against treating “skeleton-only” as a universal debugging
answer. It supports skeleton traces as the default minimized first step, with
explicit escalation only when a defect class requires another independently
approved artifact.

## Version 2 trace contract

[`MotionTraceV2Schema`](../packages/motion-contract/src/schema.ts) keeps v1
parsing for existing replay fixtures and adds a strict export envelope:

- at most 600 frames, 128 stable tracker-health events, four concurrent
  players, 64 trace-local track identities per volatile epoch, and 4 MiB after
  runtime parsing;
- exact dropped-frame and dropped-health-event counts plus explicit
  track/player-limit flags, so a partial window cannot claim completeness;
- at least one frame, strictly increasing frame and health sequence numbers,
  and monotonic source/health timestamps;
- exact sorted provenance for Motion `0.4.0`, coordinate specification,
  frame sources, timestamp qualities, and exported profiles;
- trace-local `trace-player-1` through `trace-player-64` pseudonyms instead of
  provider or profile identifiers;
- portable core17 normalized x/y, visibility, and observed state only;
- no MediaPipe-rich landmarks, z values, provider-world coordinates, or
  presence values;
- explicit false flags for raw frames, audio, portraits, profile identifiers,
  and free text;
- honest positive flags for derived skeletons, trace-local track identifiers,
  and exact export time;
- no persistence before explicit export; and
- explicit disclosure that an exported file is user-managed and must be
  deleted separately.

The JSON Schema artifact is
[`motion-trace.schema.json`](../schemas/motion-trace.schema.json). Runtime
validation adds the exact provenance, ordering, pseudonym, minimization, and
byte-bound checks that are not all representable in portable JSON Schema.

[`TraceBuffer`](../apps/console-lab/src/trace-buffer.ts) now:

- validates a capacity from 1 through 600;
- clones and minimizes every retained frame;
- maps each source track to a trace-local pseudonym for one buffer epoch;
- clears the map, frames, and health history together;
- keeps only the newest 128 closed tracker-health events;
- counts capacity eviction, skips rather than throws on an unrepresentable
  player/track frame, and preserves explicit limit flags;
- emits v2 only after at least one frame exists; and
- derives provenance from the exact retained content.

The console disables export while the buffer is empty, records stable health
events through the same volatile trace epoch, and still downloads only after
the existing deliberate local action. It does not upload or automatically
persist a trace.

## Exercise boundary

The committed artifacts are:

- [`blind-trace-bundle-v1.json`](../benchmarks/skeleton-debugging/blind-trace-bundle-v1.json),
  containing eight neutral-ID traces and reported symptoms but no truth;
- [`blind-triage-submission-v1.json`](../benchmarks/skeleton-debugging/blind-triage-submission-v1.json),
  containing the trace-only analyzer submission; and
- [`blind-triage-result-v1.json`](../benchmarks/skeleton-debugging/blind-triage-result-v1.json),
  revealing the committed truth and recomputed scores.

The triage function accepts only the bundle object. Its closed findings are
derived from:

- unsafe action authority under missing/low-confidence required landmarks;
- coordinated named hip/shoulder axis discontinuity;
- implausible trace-local track displacement over at most 100 ms;
- absent metric floor evidence;
- absent camera-exposure timestamp quality;
- missing or low-visibility landmarks; and
- stable tracker-health reason codes.

The truth commitment prevents the scored artifact from silently changing the
expected case after submission. It is not confidentiality from the repository
author: the deterministic synthetic fixtures and truth are source-visible.
“Blind” here means the automated triage interface receives no truth object. It
is not an independent human debugging study and cannot establish developer
diagnostic success.

## What the trace can and cannot establish

### Adequate first-line evidence

- exact downstream Motion frame and action lifecycle output;
- which trace-local track received an action;
- required-landmark observation and confidence at authorization time;
- reproducible output ordering and timing under the declared timestamp
  quality;
- health status and stable reason transitions;
- gross anatomical-axis or track-position discontinuities; and
- replay of game/consumer behavior driven by those exact frames.

### Symptom evidence without root attribution

- apparent identity changes after upstream association;
- anatomical left/right discontinuity after provider adaptation;
- missing landmarks without the scene pixels that caused them; and
- action misses where the trace shows inputs but omits internal model,
  smoothing, threshold, or adapter state.

### Insufficient evidence

- motion blur, lighting, crop, lens distortion, mirrors, television people,
  and physical occlusion;
- detector candidates and association alternatives that were discarded before
  the final Motion frame;
- true floor contact without a synchronized independent contact reference;
- camera-to-action latency without a qualified exposure timestamp;
- backend conversion/operator failures not represented by stable health codes;
  and
- target resource, driver, USB, power, thermal, or scheduling causes.

Adding raw video by default would violate the existing privacy direction and
still would not automatically supply contact truth, exposure timing, internal
candidate state, or target telemetry. Escalation must be defect-specific.

## Reproduction and validation

```powershell
corepack pnpm exec tsx scripts/generate-skeleton-debugging-exercise.ts bundle
corepack pnpm exec tsx scripts/generate-skeleton-debugging-exercise.ts triage
corepack pnpm exec tsx scripts/generate-skeleton-debugging-exercise.ts score
corepack pnpm exec tsx scripts/validate-skeleton-debugging-exercise.ts
corepack pnpm exec tsx --test scripts/validate-skeleton-debugging-exercise.test.ts
corepack pnpm --filter @vcg/motion-contract test
corepack pnpm --filter @vcg/console-lab test
corepack pnpm validate:schemas
```

Ten adversarial validator tests reject raw-frame flag substitution, stable
profile IDs, trace replacement behind a digest, post-triage root injection,
truth changes after commitment, inflated aggregate claims, undeclared fields,
missing/reordered cases, and timestamp-provenance substitution.

## Remaining qualification

I-070 remains active. Completion requires:

1. Q-237 retention, reviewer, and defect-specific escalation choices;
2. one or more consented real failures collected under the selected short
   retention and deletion policy;
3. a reviewer who did not author the fixture, truth, or analyzer;
4. a frozen bug report and trace before diagnosis;
5. scoring that separates reproduced output, plausible cause, and proven root;
6. comparison with only the minimum extra artifact required by each failed
   class;
7. explicit export/delete usability and filesystem/download inspection; and
8. target backend and Linux evidence without raw recording by default.

Until then, v2 is a bounded research/debugging export format, not a qualified
support collection or automatic diagnostic pipeline.
