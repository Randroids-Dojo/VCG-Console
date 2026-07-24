# First living-room prototype success criteria

Last updated: 2026-07-23

This checklist defines when one hardware/software configuration may be called a passing first VCG living-room prototype. It closes the criteria-definition task I-007; it does not claim that any current desk or target configuration has passed.

Every result is scoped to one exact tier, commit, room, camera placement, hardware inventory, operating-system image, browser/runtime, tracker/model, controller set, network condition, and game build. Passing one configuration does not qualify another. A failed or missing required row makes the configuration fail; `not run`, `unknown`, and indirect evidence are not passes.

## Evidence header

Complete this before testing:

- [ ] Commit and clean-build identifier.
- [ ] Tier and exact CPU, GPU/accelerator, RAM, storage, power, cooling, and enclosure state.
- [ ] Operating-system image, kernel, drivers, firmware, browser/runtime, Rust host, tracker/model, and game versions.
- [ ] Camera vendor/product/firmware, mode, cable/port, physical position, pitch, field of view, shutter, and activity indicator.
- [ ] Controller/remote identities, transports, mappings, battery state, and player assignment.
- [ ] Primary-room sheet and floor plan link, including the confirmed clear 8 x 8 ft (2.4 x 2.4 m) zone, television, viewing distance, lighting/lux, windows, furniture, hazards, network, and cable route.
- [ ] Test operator, consent record, start/end time, ambient conditions, and known deviations.
- [ ] Artifact directory containing raw machine-readable measurements, command output, labeled skeleton-only traces, screenshots, and issue log. Do not store raw room video by default.

## Measurement rules

1. Use a monotonic clock for durations. Start at the deliberate user action or power application named by the row and stop only when its stated usable condition is true.
2. Run at least 20 complete trials per launch/resume path and per required motion action for each blocking persona. Publish every attempt, failure, retry, p50, p95, and worst value; do not discard warm-up or failed runs after testing begins.
3. Run the representative game/tracker workload concurrently. A benchmark-only or inference-only path cannot pass an end-to-end gate.
4. Label intended action start/end and received events before calculating motion scores. Precision is true events divided by all emitted events; recall is detected intended events divided by all intended events.
5. A required action passes the first working gate at precision >= 95% and recall >= 90% for each blocking persona and tested placement. Privileged Back, Pause, Home, Resume, and Exit flows additionally require zero unintended activations during the negative-action and idle run.
6. Measure camera-to-action latency from a trustworthy camera exposure timestamp to recognized-action receipt at the game API. Capture-arrival, callback, inference-only, animation, or display timestamps must be labeled separately and cannot prove the 120 ms gate.
7. Record failures as failures. Re-running a failed trial may demonstrate recovery but does not replace the original result.

The 20-trial and action-score thresholds are reversible working gates under D-130. D-106 and D-110 remain the authoritative product requirements.

## Acceptance checklist

### A. Environment and safe setup

- [ ] The primary-room evidence is complete and the marked 8 x 8 ft zone is physically clear, not merely visible to the camera.
- [ ] The below-TV prototype, camera, cables, power, and enclosure are stable and cannot enter the play zone during the run.
- [ ] A school-age child and an adult primarily playing standing each complete the blocking script with informed household consent. Seated and limited-range cases are reported as exploratory and are not represented as qualified.
- [ ] The UI identifies unsafe or incomplete placement/calibration and offers a controller- and motion-accessible correction or cancellation path.

Evidence: I-001, I-002, I-037, I-059, I-194.

### B. Boot, resume, and launch timing

For every claimed tier, all 20 trials must meet the limit; publish p50, p95, and worst:

| Path | Timer start | Passing end condition | Limit |
|---|---|---|---:|
| Cold boot | Power application | Launcher accepts supported controller input | <= 60 s |
| Warm resume/wake | Supported wake action | Prior or safe launcher state accepts input | <= 5 s |
| Installed local game | Deliberate launch selection | Game accepts intended gameplay input | <= 15 s |
| Hosted game | Deliberate launch selection | Game accepts input, or the console truthfully reports the current observable phase | <= 30 s |

- [ ] Every path gives branded visible feedback within 250 ms of the deliberate action, keeps Back/cancel responsive, and distinguishes progress, slow work, offline, hang, crash, and recovery without fabricated percentages.
- [ ] A heartbeat or phase update never extends the absolute timeout indefinitely.

Evidence: I-023, I-107, I-153, I-154.

### C. Offline core

With WAN access disabled before boot:

- [ ] The console reaches the launcher and supports controller navigation.
- [ ] Local body tracking starts and the obstacle sample is playable.
- [ ] Installed local games start without an account or network dependency unless their reviewed manifest explicitly declares otherwise.
- [ ] A network-required hosted game fails into the branded offline state with working Retry, Details, Back, and Exit.
- [ ] Restoring the network permits an explicit retry; it does not silently transfer focus or auto-launch content.

Evidence: D-034, I-009, I-099.

### D. One-player motion and latency

Run the labeled script at the center and each qualified zone edge for both blocking personas:

- [ ] Candidate presence never grants control; hands-together deliberately joins one active player.
- [ ] Presence/in-zone, jump, duck, dodge left, and dodge right each meet the score gate.
- [ ] Swipe left/right, hands-together Select, crossed-forearms Back, and long-X Pause each meet the score gate with visible hold/cancel/cooldown feedback.
- [ ] Every required action is delivered at <= 120 ms p95 from exposure to game API under the concurrent representative workload; p50, p95, p99, drops, false actions, thresholds, and timestamp quality are published.
- [ ] A 15-minute negative-action/idle script including ordinary play, spectators, passersby, television imagery, mirrors where present, partial occlusion, and controller use produces zero unintended privileged Back, Pause, Resume, or Exit activations.
- [ ] No test uses raw-frame export as a prerequisite; skeleton-only traces reproduce the scored action sequence.

Evidence: I-015, I-035, I-052, I-053, I-060, I-080, I-178, I-210.

### E. Tracking loss and recovery

- [ ] Isolated missed updates do not freeze gameplay.
- [ ] Approximately 300 ms of sustained multi-update loss freezes simulation, timers, hazards, scoring, and motion actions; report observed confirmation timing and jitter.
- [ ] Reacquiring the same session-local track within two seconds silently resumes the frozen session.
- [ ] Failure to reacquire keeps the game paused and opens the console-owned recovery overlay with Resume focused and Exit one swipe away.
- [ ] Passive body return never resumes. A candidate must deliberately select Resume, after which that candidate owns the one-player session.
- [ ] Camera disconnect, permission loss, and tracker-process failure pause immediately and retain controller recovery.

Evidence: I-056, I-109, I-183, I-210.

### F. Controller and reserved escape

- [ ] Every launcher, loading, settings, game, overlay, fault, and recovery state can reach Back, Home, Retry where applicable, and Exit without motion, keyboard, or mouse.
- [ ] Supported standards-conformant controllers map automatically, including hot-plug and reconnect; ambiguous devices enter a guided mapper without trapping the user.
- [ ] Home/Back remains console-owned during top-level hosted navigation, fullscreen, pointer lock, loading, an unresponsive page, native process hang, and crash.
- [ ] Manual long-X Pause opens the console overlay with Exit focused; tracking-loss recovery opens it with Resume focused. Neither exits or resumes without a second deliberate selection.
- [ ] Returning to the launcher restores a visible, valid focus target and does not expose a desktop.

Evidence: I-091, I-109, I-152, I-155, I-183, I-209.

### G. Privacy and data boundaries

- [ ] Normal tracking displays or exports no raw camera image and stores or transmits no raw frame.
- [ ] Network and filesystem observation finds no undeclared frame, skeleton, profile, save, diagnostic, or hosted-traffic egress.
- [ ] Closing the physical shutter blocks the lens, while software describes only camera enabled/disabled/unavailable/activity state unless a trustworthy shutter sensor exists.
- [ ] Camera capture and activity indication stop on idle/suspend and after tracking ends.
- [ ] Any camera microphone is disabled at the operating-system boundary and unavailable to the launcher, tracker, games, and ordinary profiles.
- [ ] Diagnostic export requires a deliberate action, is skeleton-only, is bounded, and has an explicit deletion path.

Evidence: I-133, I-134, I-137, I-140.

### H. Fault recovery and endurance

- [ ] Startup silence, heartbeat loss, non-zero exit, injected GPU reset, and injected out-of-memory each produce the correct branded state, terminate/reap the unhealthy child, perform no more than the configured bounded restart, and return control to the launcher after exhaustion.
- [ ] Launcher/browser failure is restarted by the service manager without exposing a desktop or requiring a keyboard.
- [ ] A continuous 60-minute representative play/launch/recovery soak completes without an unrecovered crash, controller trap, camera remaining active after stop, unbounded queue/log growth, or progressively worsening latency.
- [ ] Sudden-power and update-interruption qualification is explicitly linked or marked not yet qualified; a configuration cannot claim Raspberry Pi appliance readiness until D-109 evidence passes.

Evidence: I-024, I-109, I-110, I-141, I-162, I-209.

## Result

| Field | Value |
|---|---|
| Configuration identifier | |
| Overall result (`pass` or `fail`) | |
| First failing or missing criterion | |
| Evidence bundle | |
| Open defects and severity | |
| Retest commit/configuration | |

A pass authorizes only the phrase “passing first living-room prototype” for the recorded configuration. It does not qualify two or four players, seated body play, Raspberry Pi or Hailo unless that exact configuration was tested, another room, another camera, a public release bundle, commercial support, or the optional Steam Machine.
