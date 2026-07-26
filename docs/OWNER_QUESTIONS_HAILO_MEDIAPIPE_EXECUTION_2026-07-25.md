# Owner questions: Hailo and MediaPipe execution

Date: 2026-07-25

Investigation: I-161

The refreshed comparison plan remains blocked and records zero attempts. These
questions must be answered before the plan can become executable. They do not
authorize hardware access, package installation, participant collection, raw
media, threshold selection from observed outcomes or a richer-profile game
requirement.

## Q-262 - honest Hailo Motion source boundary

Should the next Motion schema add a closed `hailo-native` source, or should one
reviewed exact translator map Hailo observations into another explicit
provider-neutral source representation?

Motion `0.4.0` has honest `mediapipe-web`, `rtmo-native`, `replay` and
`synthetic` identities but no Hailo identity. Labeling Hailo output as any of
those would make provenance false. To close Q-262, approve one visible schema
change or exact translation contract, its compatibility behavior, unknown-
source rejection, capability negotiation, trace/export representation and
cross-version tests. Do not silently add a string to only one serializer.

Current recommendation: add a narrow closed `hailo-native` value in an
explicit next Motion version unless a concrete second external provider proves
that a more general identifier can remain bounded and fail closed.

Owners: Motion API, tracking, SDK, security, compatibility.

## Q-263 - trusted Hailo conversion and artifact ownership

Which exact native runtime boundary converts the Hailo detection/post-process
object into `hailo-coco17-normalized/v1`, and which artifacts/configuration are
inside that trusted conversion identity?

To close Q-263, bind the Pi image, kernel, PCIe driver, HailoRT, TAPPAS/Hailo
Apps source, HEF, compiled post-processor, camera pipeline, score calibration,
landmark ordering, coordinate transform, clamp/missing-value behavior and
translator binary. Exercise malformed counts, NaN/infinity, swapped limbs,
out-of-range coordinates, score edges and runtime/model mismatch. Games and
installed packages must not supply or override this translator.

Current recommendation: keep conversion inside the trusted native tracker and
treat any tuple change as a new comparison configuration.

Owners: tracking, native platform, ML, security, release engineering.

## Q-264 - participant minimums and blocking metric gates

How many independent school-age-child-standing and adult-standing
participants are required, and what exact per-slice action, floor-event,
latency, drop, resource and game-frame thresholds qualify core17 or prove a
richer profile necessary?

The plan already fixes 20 positive attempts per action/participant/placement,
15 negative minutes per participant/placement and D-110's 120 ms p95
exposure-to-action ceiling. To close Q-264, freeze participant minimums,
precision/recall/F1 and false-event gates, floor-contact timing/quality gates,
pose FPS/drops, CPU/GPU/NPU/RAM/swap, temperature/clocks/power/acoustics and
concurrent obstacle frame-time gates. Define uncertainty, invalid-attempt and
multiple-comparison handling. Every blocking persona/placement/action/floor
slice must pass; aggregate improvement cannot hide a failed cell.

Owners: product owner, ML, QA, accessibility, safety, performance, thermal,
power, acoustics, privacy.

## Q-265 - same-exposure fanout fallback

If target evidence proves simultaneous volatile in-memory fanout infeasible,
may a temporary encrypted raw-frame corpus be used, and under what exact
consent, minimization, access, retention, deletion and audit boundary?

The current authorized design is simultaneous volatile fanout and no raw
retention. Sequential live sessions or later nominally similar movement are
not same input. To close Q-265 only after a documented fanout failure, either
keep execution blocked or approve a separate minimized exception with exact
participants/guardians, purpose, encryption/key custody, broker-only access,
byte/corpus digest, retention deadline, deletion verification, incident path
and prohibition on raw bytes/paths in results or diagnostics.

Current recommendation: keep the campaign blocked rather than authorize raw
retention until target measurements demonstrate that fanout cannot meet the
complete workload.

Owners: project owner, privacy, legal, security, participant/guardian, QA.

## Existing boundaries retained

- Q-085 remains the core17-sufficiency question this campaign answers.
- Q-087/I-157 govern the immutable Pi/Hailo image and runtime inputs.
- Q-251 through Q-253 govern independent geometry, accuracy thresholds and
  sensitive labeling data.
- Q-254 governs the exact received camera assembly.
- Q-258 governs a persistent paired replay corpus for the separate 13/26 TOPS
  comparison; replay timing cannot replace I-161's same-exposure live timing.
- Q-260/Q-261 govern hosted compatibility workloads, not this obstacle
  core-versus-rich action/floor comparison.
