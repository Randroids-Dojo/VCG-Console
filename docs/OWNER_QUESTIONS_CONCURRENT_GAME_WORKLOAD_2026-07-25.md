# Owner questions: concurrent tracker and game workload

Date: 2026-07-25

Investigation: I-159

The machine-checked plan is intentionally blocked and records zero results.
Do not open service accounts, issue mutating requests, collect participant
data, inject faults or populate a gate from observed runs because this plan
exists.

## Q-260 - hosted activity, account, service and evidence authority

What exact non-destructive sixty-minute activity script may exercise VibeBots,
Mi Casa Es Su Casa and Determined, and which service/account/test-data actions
are authorized for each title?

An idle page cannot qualify representative game load, but realistic activity
may create hosted accounts, messages, generated text, notifications, scores,
cache entries or billable API requests. It may also expose tokens, cookies,
typed content or participant data to diagnostics. To close Q-260:

1. name the allowed guest/test-account mode and credential custodian for each
   title;
2. enumerate permitted and prohibited UI actions, service routes, mutations,
   generated/typed test data and cleanup requirements;
3. freeze a deterministic operator/controller script and expected visible
   checkpoints without calling scripted reachability playability;
4. define how the observed hosted deployment is content-bound at session time;
5. approve bounded, sanitized network/service evidence with no bodies, tokens,
   cookie/storage values, query strings, fragments or free text; and
6. define rate, cost, notification, abuse and rollback protections before any
   automated or repeated session.

This decision does not grant participant collection, purchase or fault
injection authority.

Owners: project owner, game owners, platform, QA, security, privacy,
operations, finance.

## Q-261 - sustained performance and recovery qualification gates

What exact per-workload thresholds, fault attempt counts and recovery ceilings
qualify the four I-159 rows before results are visible?

D-106, D-108 and D-110 already fix 15/30-second interactivity, 35 dBA at one
metre and 120 ms p95 exposure-to-action limits. The plan also requires zero
privileged false activations, zero unrecovered failures, zero unexpected
process exits during soak, every-cell pass and no aggregate rescue. To close
Q-261, approve rationale and exact values for:

- per-action precision and recall under each workload;
- minimum pose FPS and game FPS;
- maximum p95 game frame time and capture/pose drop ratios;
- maximum sustained SoC and accelerator temperature and wall power;
- maximum sanitized service-error ratio;
- repetitions per camera, tracker, renderer, network, Home/Back and launcher
  fault cell; and
- maximum recovery time plus fresh-instance and state-integrity oracles.

Also decide whether one 60-minute run per workload closes only I-159's first
soak or must be expanded before any platform reliability claim. The checked-in
plan explicitly forbids treating one run as a reliability-rate estimate.

Owners: product owner, performance, ML, QA, thermal, power, acoustics,
platform, game owners, accessibility, safety.

## Existing boundaries retained

- Q-082 remains the complete Pi/Hailo feasibility question this campaign
  informs.
- Q-084/Q-259 govern any 13 TOPS versus 26 TOPS comparison and value decision.
- Q-085/I-161 govern COCO-17 sufficiency versus richer MediaPipe data.
- Q-087/I-157 govern immutable Pi/Hailo image and runtime inputs.
- Q-253 governs sensitive labeling images and derived participant evidence.
- Q-254 governs the exact received UVC camera assembly.
- I-091/Q-079 govern compositor-owned Home/Back; a scripted browser exit is not
  a substitute.
