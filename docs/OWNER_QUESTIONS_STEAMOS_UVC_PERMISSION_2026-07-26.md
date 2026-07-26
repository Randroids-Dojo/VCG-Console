# Owner questions: SteamOS UVC capture and permissions

Date: 2026-07-26
Scope: I-167
Status: decisions required before execution

These questions preserve the strict zero-result campaign. Freeze every answer
in an exact reviewed protocol before the first affected operation. An answer
does not itself authorize purchasing, target or camera operation, permission
changes, room or participant capture, suspend or update actions, route or
camera selection, qualification, publication, or a product-tier change.

## SUCAM-001 - Exact received SteamOS target

Which received hardware revision, inventory, firmware, SteamOS image, kernel,
drivers, PipeWire version, Gamescope/compositor, package revision, and clean
state form the target? Define immutable digests, clock configuration,
background services, update state, and every change that invalidates results.

## SUCAM-002 - Exact received shared camera and USB topology

Which received camera unit, receipt, USB descriptors, firmware, video/audio
interfaces, cable, adapter, port, controller, hub, power path, physical
shutter, activity indicator, and microphone inventory apply? Who may purchase
or connect it, and what replacement or topology change requires repeating
which cells?

## SUCAM-003 - Four-route comparison and selection rule

Must all four Flatpak/Steam-runtime and V4L2/PipeWire routes complete every
scenario before selection? Freeze the ranking for permission minimization,
containment, maintainability, timestamp quality, control support, latency,
performance, recovery, and package compatibility without adjusting weights
after results are visible.

## SUCAM-004 - Flatpak manifest and permission policy

Approve the exact application ID, runtime/SDK, extensions, finish arguments,
portals, sockets, devices, filesystems, background behavior, camera and audio
permissions, PipeWire dependencies, update channel, and process boundary for
both Flatpak routes. Which broad or excess permission is an automatic
rejection?

## SUCAM-005 - Steam-runtime content and permission policy

Approve the exact content manifest, runtime and dependency closure, launch
wrapper, sandbox or bubblewrap policy, environment clearing, V4L2/PipeWire
access, device/network/filesystem permissions, writable roots, update path,
and descendant ownership for both Steam-runtime routes. How is access kept
independent of Steam identity and read-only-root modification?

## SUCAM-006 - V4L2 and PipeWire provenance

Which enumeration and independent probes bind USB interfaces to exact V4L2
nodes, PipeWire nodes, portal sessions, formats, ownership, cgroups, and
effective permissions? Define stale-node, renumbering, multi-camera,
permission-denied, portal-denied, and oracle-failure behavior.

## SUCAM-007 - UVC modes, controls, buffers, and genuine 1080p60

Which pixel formats, color spaces, frame sizes, intervals, buffers, exposure,
gain, white balance, focus, power-line, and other controls are required? Define
how requests, readbacks, stream effects, reopen persistence, unique exposures,
drops, duplicates, and sustained genuine 1920 by 1080 at 60,000 millihertz are
measured without counting duplicates or advertised capability.

## SUCAM-008 - Exposure timestamps and common clock

Which device, driver, buffer, or application field is authoritative exposure
time for each route? Define clock domains, offset and regression calibration,
monotonicity, wrap and suspend handling, epoch boundaries, uncertainty, and
the proof that arrival callbacks or tracker inference time are never
substituted for exposure time.

## SUCAM-009 - Trusted tracker and representative workload

Which exact tracker build, model, resolution, queue, backpressure, frame-drop,
common-clock, process/cgroup, health, and clean-stop contract applies? Which
game or package, render load, Motion consumer, warmup, fault injections, and
resource instrumentation represent concurrent use without turning a replay
or synthetic frame into camera qualification?

## SUCAM-010 - Microphone, privacy, indicator, and shutter truth

Which independent probes prove zero audio functions, tracks, buffers, samples,
and returned bytes through every route and descendant? Define camera
permission, software-open, active-streaming, physical indicator, and physical
shutter states separately; acceptable indicator behavior; unsensed-room
proof; participant notice or consent; and automatic rejection for any
undeclared microphone or untrusted camera access.

## SUCAM-011 - Hot-plug, revoke, suspend, update, and recovery

Which exact absent-at-launch, denied, grant, hot-plug, streaming disconnect,
same/different-port reconnect, revoke/regrant, suspend/resume, package
update/rollback, SteamOS update, offline restart, and recovery transitions are
tested? Freeze timeouts, epochs, retries, stale-frame and leaked-grant rules,
state restoration, clean stop, and the rule that later recovery cannot erase
the original failure.

## SUCAM-012 - Independent oracles

Which independently trusted USB, video-node, PipeWire, portal, permission,
exposure, audio, indicator, process/cgroup, filesystem, IPC, network, tracker,
resource, and recovery probes apply? Define sampling, synchronization,
uncertainty, observer effects, background noise, oracle disagreement, and the
conditions that invalidate a cycle rather than convert a product failure into
a harness retry.

## SUCAM-013 - Schedule and numeric gates

Freeze operators, route order or randomization, warmups, cooldowns, target and
camera sample counts, sustained duration, drop-rate ceiling, frame-interval
jitter, timestamp uncertainty, open-to-first-exposure, capture-to-tracker,
permission, reconnect, suspend-recovery, and update-recovery limits, plus CPU,
GPU, resident-memory, and USB-bandwidth ceilings. Who independently reviews
all 56 cells and 1,120 valid cycles?

## SUCAM-014 - Data rights, privacy, retention, and incidents

Approve the closed result schema, opaque labels, redaction, room and
participant rights, raw-media prohibition, temporary-buffer handling,
declared probe traffic, custody, access, retention, verified deletion,
incident response, and adverse-evidence preservation. Who verifies that no
raw media, voice, face, exact age, serial, stable identifier, account, profile,
save, credential, path, query URL, environment/argument value, arbitrary
message, or free text enters repository or release evidence?

## SUCAM-015 - Operation, selection, qualification, and publication authority

Who may authorize camera and USB connection, target operation, permission
changes, participant collection, suspend, package update, SteamOS update,
offline restart, recovery, and destructive actions? Who may declare a route or
target qualified, select a camera or route, publish results, or change support
tier? State explicitly that an I-167 pass does not select the shared camera,
close adjacent privacy, geometry, pose, latency, gameplay, or I-166 gates,
replace required reference targets, or make Steam Machine the primary VCG
appliance.
