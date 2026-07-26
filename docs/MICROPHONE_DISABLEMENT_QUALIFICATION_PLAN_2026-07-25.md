# Microphone-disablement qualification plan — 2026-07-25

Status: blocked, zero-result pre-registration

Authority: D-046, I-179, Q-055

## Purpose

The selected camera may physically contain microphones, but the product
requirement is stronger than an application choosing `audio: false`. Raspberry
Pi OS, SteamOS, and the Windows fallback must each prevent the launcher,
tracker, games, browser content, native descendants, developer mode, and every
ordinary local profile from acquiring microphone samples by default.

The strict plan is stored at
`benchmarks/microphone-disablement/microphone-disablement-qualification-plan-v1.json`.
It records no result and grants no permission to purchase hardware, modify an
OS policy, or perform an audio probe.

## Critical evidence distinction

The following are not proof that capture is disabled:

- an application requests `audio: false`;
- a permission prompt is not accepted;
- a microphone toggle appears off;
- the endpoint is muted;
- returned PCM happens to contain silence or zeros;
- a browser Permissions Policy blocks one page while a native route remains;
- a device is absent from one UI while a service or device node can open it; or
- one fresh-install attempt passes before an update or recovery path.

For this campaign, any returned audio buffer is a failure even when the samples
are silent. A passing attempt must fail before sample delivery because capture
is denied or the device is unavailable to that caller.

## Closed target and matrix boundary

The plan fixes three target rows:

1. Raspberry Pi OS on Raspberry Pi 5 ARM64;
2. SteamOS on the optional x86-64 Steam Machine target; and
3. the ordinary x86-64 Windows fallback target.

Every exact camera identity, USB descriptor, OS image/build, audio stack,
sandbox runtime, browser, and ordinary-user policy digest remains `null` until
received and independently recorded.

Each target must exercise eight enforcement layers:

1. USB audio-function inventory;
2. kernel or Windows device access;
3. PipeWire, ALSA, or Windows Audio capture;
4. application sandbox access;
5. browser permission behavior, including a hostile site-level grant;
6. a signed bundled-web test package;
7. a signed native test package and descendants; and
8. launcher, tracker, developer-mode, and local-profile behavior.

Each layer must run in eight phases: fresh install, first ordinary-user boot,
camera replug, offline restart, qualified update, failed-update rollback,
recovery-mode return, and factory reset/reprovision. The required matrix is the
full ordered Cartesian product: 3 targets × 8 layers × 8 phases = 192 cells.
No aggregate result may conceal a missing or failed cell.

## Acceptance boundary

The validator fixes zero as the maximum for:

- ordinary-user capture successes;
- browser audio-track successes;
- game-package capture successes;
- returned audio buffers; and
- returned audio bytes.

Every cell must pass. Update, rollback, recovery, and reset must restore the
policy before an ordinary user can log in. Denial must remain diagnosable by a
bounded path-free code; it must not expose device paths, account names, captured
values, or arbitrary provider text.

The minimum valid attempts per cell and attempt timeout are intentionally
unset. Selecting those values is an owner decision, not a validator guess.

## Ready-plan and result envelope

`scripts/validate-microphone-disablement-result.mjs` defines the executable
transition without changing the tracked blocked plan. A ready plan must bind:

- every target camera, USB descriptor, OS image/build, audio stack, sandbox,
  browser, and ordinary-user policy;
- one canonical probe bundle and ordered schedule;
- between 1 and 20 valid attempts required per cell;
- a 100 ms to 60 second attempt timeout;
- target access, OS-policy mutation, and audio-probe handling authority; and
- the safe version-1 choice of no administrative microphone diagnostic path.

Readiness still records no result. A canonical result must bind the exact ready
plan and enumerate all 192 cells in target/layer/phase order. Each attempt uses
closed status and outcome vocabularies, a policy digest, a unique evidence
digest, bounded monotonic timing, capture counters, and explicit zero-retention
and zero-egress assertions. Provider prose, paths, samples, and open fields are
not accepted.

The validator derives each cell and overall disposition:

- `passed` requires the owner-selected number of valid denial attempts and no
  returned track, buffer, or byte;
- `incomplete` preserves missing attempts, stopped probes, and harness-invalid
  attempts without treating them as denial evidence; and
- `rejected` records a real capture success or any returned audio without
  allowing another cell or platform to rescue it.

A target appears in `qualifiedTargetIds` only when all 64 of its cells pass.
Real protection failures are valid rejected evidence, but retained or
transmitted audio makes the artifact invalid for this data policy.

## Data boundary

The campaign authorizes no raw-audio retention, persistent sample buffer,
network egress, transcription, voiceprint, participant identifier, or free
text. Release evidence is limited to configuration digests, bounded denial
codes, counters, timings, and zero-byte assertions.

An attempted probe can encounter household sound if the policy is broken.
Therefore the current gate also withholds audio-probe authority until the exact
harness and handling procedure are approved. A failed protection must stop the
attempt immediately and must not write, transmit, replay, or inspect the
returned samples.

## Administrative diagnostic path

Whether an administrator may ever enable the bundled microphone remains
unresolved. Ordinary users, games, profiles, and developer mode cannot unlock
it under this plan. Any future diagnostic exception requires a separate owner
decision, visible disclosure and indicator behavior, a bounded expiry, exact
audit semantics, and new abuse and recovery evidence. It cannot be inferred
from D-046 or Q-055.

## Evidence completed

- The tracked plan is canonical bounded UTF-8 JSON with a 128 KiB ceiling.
- It binds the existing game-permission, hosted-browser, and prototype
  acceptance boundaries by normalized SHA-256.
- Thirteen plan test groups reject target substitution, invented inputs,
  matrix omissions, silence-as-proof, nonzero capture ceilings, retained audio,
  diagnostic unlocks, premature authority/results, duplicate fields, invalid
  UTF-8, and oversized input.
- Twelve result test groups prove complete qualification, honest incompleteness,
  and honest rejection derivation; they reject hidden capture, promoted
  summaries, cell/attempt drift, reused evidence, denial-with-bytes, retained or
  transmitted audio, plan/policy/timing substitution, unsafe readiness, and
  malformed envelopes.

No platform is qualified, no camera microphone has been probed, and no audio
sample has been collected.

Open decisions are recorded in
`docs/OWNER_QUESTIONS_MICROPHONE_DISABLEMENT_2026-07-25.md`.
