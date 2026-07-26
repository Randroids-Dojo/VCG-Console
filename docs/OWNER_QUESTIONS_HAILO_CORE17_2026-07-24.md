# Owner questions: Hailo core17 integration

Last updated: 2026-07-24

## Current bounded behavior

The repository now validates and projects an already-normalized, versioned
Hailo COCO-17 observation into provider-neutral `body.core17` player data. It
does not emit a Motion frame because Motion API `0.4.0` has no honest Hailo
source value.

The safe current behavior is to keep Hailo wire emission blocked. No caller may
label Hailo data as `mediapipe-web`, `rtmo-native`, `replay`, or `synthetic`.

## Decisions still needed

1. Should the next Motion version add a narrow closed `hailo-native` source,
   following the `rtmo-native` precedent, or replace backend-specific source
   values with a separately validated provider identifier?

   Current recommendation: use an explicit `hailo-native` value in a visible
   Motion `0.5.0` change unless a concrete second consumer demonstrates that an
   open provider identifier can remain fail-closed. This is the smallest
   honest evolution and matches D-168.

2. Which exact Hailo runtime boundary owns conversion from the native
   detection/post-processing object to
   `hailo-coco17-normalized/v1`?

   Current recommendation: keep conversion in the trusted native tracker
   process and bind it to the complete tested Pi OS/kernel/HailoRT/TAPPAS/Hailo
   Apps/HEF/post-processing tuple. Do not accept package- or game-supplied
   conversion code.

3. What measured score threshold qualifies an individual Hailo landmark as
   observed for the obstacle and shell action profiles?

   Current recommendation: retain `0.25` only as a deterministic desk-parser
   default. Select product thresholds from the consented labeled I-161/Q-085
   comparison, with action-specific missing-landmark and false-control
   evidence.

4. If the Hailo and MediaPipe paths cannot consume the same camera exposure
   through simultaneous volatile in-memory fan-out, may the comparison use a
   temporary encrypted raw-frame capture?

   Current recommendation: require simultaneous in-memory fan-out and keep raw
   retention unauthorized. If target constraints make that impossible, pause
   the campaign for an explicit owner decision and separate privacy review.
   Any exception should require specific consent, a bounded encrypted
   temporary format, broker-only access, no raw bytes or paths in the result,
   an exact deletion deadline, and a deletion audit. Do not substitute
   sequential sessions or silently retain ordinary camera footage.
