# Camera exposure and shutter-state status audit — 2026-07-25

Status: committed evidence reconciled; I-036 and I-046 are active, not complete

Authority: D-002, D-016, D-043, D-044, D-045, D-110, I-036, I-040, I-046,
I-177, Q-019, Q-211, Q-212

## Purpose

The investigation backlog still marked I-036 and I-046 open after their first
bounded implementation tranches were committed. This audit corrects that
status drift. It creates no new camera policy, physical result, purchase
authority, or product claim.

## I-036 evidence already present

Commit `a050015` added the strict camera capture-policy campaign. The blocked
plan and validator define:

- automatic, balanced-manual and short-exposure presets in a fixed selection
  order;
- exact pixel format, exposure, gain, white-balance, focus, power-line and
  capture-buffer bindings for every ready preset;
- two blocking standing personas, six lighting conditions, seven motion roles,
  252 exact cells and 5,040 ordered physical trials;
- independent sustained-frame-rate, drop, exposure-time, blur, color-drift,
  landmark-error and action-outcome measurements; and
- per-blocking-cell qualification with no aggregate rescue and no substitution
  of capture-arrival time for camera exposure time.

The tracked plan intentionally contains null camera controls, lighting
classification, protocols and gates. It proves an auditable method, not a
selected policy or physical camera result. I-036 is therefore active rather
than open or complete.

## I-046 evidence already present

Commit `4df2f3c` added a closed software camera-state model and visible Motion
Lab presentation for disabled, starting, permission-requesting, active,
permission-denied, unavailable, disconnected and failed states. Software
access, capture-stream activity and physical shutter position are separate
facts. Every state reports the shutter as `NOT SENSED`; no software state can
claim it open or closed.

The shared-camera campaign separately pre-registers physical optical-shutter
and ordinary-user-visible capture-indicator checks. That plan remains blocked
and has no result. Together these artifacts begin both the software and
physical halves of I-046 without collapsing one into proof of the other.

## Verification refreshed

| Evidence | Result |
| --- | --- |
| `node --test scripts/validate-camera-capture-policy-campaign.test.mjs` | 15 of 15 passed. |
| `corepack pnpm --filter @vcg/console-lab exec vitest run src/camera-state.test.ts` | 15 of 15 passed. |
| `node --test scripts/validate-shared-camera-qualification-plan.test.mjs scripts/validate-shared-camera-qualification-result.test.mjs` | 26 of 26 passed. |
| Four focused `console-flow.spec.ts` Chrome cases | 4 of 4 passed: active/disabled, permission denied, disconnect, runtime failure/retry. |

These are contract, synthetic and development-browser checks. They do not
qualify a physical camera, shutter, indicator, room, enclosure or target.

## Remaining boundary

I-036 still needs an exact camera/room/control tuple, owner-approved lighting
floor and gates, trustworthy exposure-clock proof, independent optical and
pose/action truth, participant/data authority, all scheduled trials, and a
derived policy result.

I-046 still needs physical optical-blocking evidence, a hardware/software
indicator truth table across lifecycle and failure states, across-room
comprehension, reachability/visibility checks, idle/suspend behavior, and an
exact selected camera/enclosure candidate. Existing owner questions remain
unanswered; this audit does not answer them by assumption.
