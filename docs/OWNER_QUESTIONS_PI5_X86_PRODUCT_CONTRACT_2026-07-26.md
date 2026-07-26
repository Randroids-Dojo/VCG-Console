# Owner questions: Pi 5 and ordinary x86 product-contract comparison

Date: 2026-07-26
Scope: I-173
Status: decisions required before execution

These questions preserve the strict zero-result comparison. Freeze each
answer in an exact reviewed protocol before the first affected action. An
answer does not itself authorize purchase, assembly, installation, camera or
controller operation, participant or service use, fault injection, power
interruption, destructive recovery, qualification, publication, or a
reference-tier change.

## RXC-001 - Exact required target tuples

Which exact received Raspberry Pi 5, AI HAT+ 26 TOPS, power supply, cooling,
RAM, storage, case, firmware, OS image, kernel, drivers, display, camera,
controller, network, room, and instruments define the lower-cost row? Which
exact ordinary x86-64 machine and corresponding complete tuple define the
premium row? State clean-state requirements and every material change that
invalidates affected evidence.

## RXC-002 - Identical common product contract

Approve the common source revision, game manifests and versions, Motion
`0.4.0` schemas and profiles, action definitions, visible UX, launcher,
tracker, package, retro path, controller behavior, reserved actions, offline
scope, and acceptance gates. Which architecture-specific differences are
permitted behind reviewed interfaces, and how is any target-specific feature
or quality reduction rejected?

## RXC-003 - Reproducible aarch64 and x86 packages

Which exact build environments, dependency closures, signing keys or test-key
policy, manifests, installers, read-only and writable roots, uninstall rules,
version transitions, rollback artifacts, and reproducibility checks apply to
aarch64 and x86-64? Which source, toolchain, dependency, key, image, or package
change requires rebuilding and repeating cells?

## RXC-004 - Camera, microphone, clocks, calibration, and room

Which exact qualified shared wide-angle UVC camera, mode, USB topology,
V4L2/PipeWire path, permissions, microphone-denial route, controls, privacy
state, exposure timestamp authority, common-clock mapping, uncertainty,
calibration, geometry, lighting, and room apply to both targets? Which change
requires camera or workload requalification?

## RXC-005 - Controller, reserved actions, display, and audio

Which controller samples, USB/Bluetooth paths, mappings, glyphs, focus states,
hotplug/reconnect cases, input epochs, Home/Back/Pause/Exit ownership, TV,
display modes, safe area, audio route, CEC, sleep/wake, input switching, and
hotplug protocol apply? Define the independent oracle for an action delivered
to a game, swallowed, duplicated, or routed to stale state.

## RXC-006 - Accountless first path and offline lifecycle

Freeze first-boot or supported-path entry, launcher/tracker/profile readiness,
network-present and network-absent states, signed package and Retro 2048
launch/save/return/restart, local identity and save ownership, service
boundaries, and every Steam/account prompt or dependency. Which core paths
must function from clean storage without any account, network, or prior cache?

## RXC-007 - Exact Pi and Hailo runtime

Which exact Pi image, firmware, kernel, Hailo driver, runtime, model, compiler,
HEF or equivalent artifact, preprocessing, post-processing, action mapping,
package integration, resource allocation, thermal mode, and recovery result
define the Pi row? Which fallback is permitted, how is it disclosed, and what
change invalidates the Pi result?

## RXC-008 - Exact ordinary-x86 runtime

Which exact x86 Linux image, kernel, CPU, GPU, driver, pose backend, runtime,
model, provider, preprocessing, post-processing, action mapping, package
integration, resource allocation, and recovery result define the premium row?
How is the backend shown to be supported rather than assumed, and what change
invalidates the x86 result?

## RXC-009 - Seven workload identities and interactions

Bind exact launcher, Obstacle, signed local package, Retro 2048, VibeBots, Mi
Casa Es Su Casa, and Determined content and versions. Approve the identical
interaction scripts, game settings, rendering, audio, saves, accounts,
service calls, generated or typed data, mutations, rate/cost limits, cleanup,
network capture, and failure probes. How are reachability, pixels, readiness,
or heartbeat prevented from substituting for gameplay?

## RXC-010 - Participant, room, ground truth, accessibility, and safety

Which consented participant strata, placements, clothing, movements, negative
windows, repetitions, ground-truth labels, room, lighting, camera placement,
warmup, rest, stop conditions, accessibility adaptations, safety observer,
and incident rules apply? Who may authorize collection, and what synthetic or
replay work remains explicitly non-qualifying?

## RXC-011 - Boot, idle, display, suspend, and update protocol

Freeze clean boot, warm resume, low-power idle, wake source, launcher
readiness, camera state, feedback, display/audio/CEC states, suspend, package,
OS and model update, induced update failure, rollback, offline restart,
root-write integrity, and version verification. Define instruments, clock
authority, start/end events, invalidity, and which prior state must be cleared.

## RXC-012 - Fault, power-cut, storage, and rebuild protocol

Approve camera, tracker, game, browser, and launcher failure injections;
storage pressure; interrupted writes; exact power-cut phases; descendant
reaping; fresh process, camera, and input epochs; state-integrity checks;
blank-storage rebuild; reinstall; keys, profiles, saves, and package data
disposition; retry rules; and stop conditions. Which operations are
destructive, and who may authorize each one?

## RXC-013 - Performance and environmental instrumentation

Approve camera/action and game timing oracles; frame and action ground truth;
CPU, GPU, accelerator, RAM, VRAM, swap, storage, network, and log counters;
wall-power and idle-energy meters; temperature, clock, throttle, and fan
sensors; one-metre acoustic meter, ambient floor, spectrum and tonality; clock
synchronization; sampling; calibration; observer effect; and uncertainty.
Which data is independently captured rather than reported by the system under
test?

## RXC-014 - Numeric gates

Freeze per-action precision and recall; pose and game FPS; game p95 frame
time; capture and pose drop rates; exposure timestamp uncertainty; per-target
CPU, GPU or accelerator use, RAM, storage growth, wall power, idle energy,
temperatures and throttle events; per-scenario fault recovery; update rollback;
rebuild/reinstall time; ordinary-x86 reuse and replacement cost; and minimum
cost difference. Define units, percentile method, uncertainty, per-cell pass
logic, invalidity, and the prohibition on post-result threshold tuning.

## RXC-015 - Delivered cost and lifecycle economics

Approve quote date, jurisdiction, currency, exact model and seller, item
prices, availability, shipping, tax, complete Pi delivered bill of materials,
ordinary-x86 reuse cost, ordinary-x86 replacement delivered cost, optional
Steam Machine cost, exclusions, electricity horizon, maintenance, updates,
repair, replacement, supported lifecycle, and uncertainty. Confirm that a
subtotal is not delivered cost, reuse is not replacement economics, and cost
cannot rescue a product-contract failure.

## RXC-016 - Schedule, review, and reference selection

Freeze target/scenario order or randomization, clean state, warmup, cooldown,
20 valid cycles per cell, one-hour concurrent workloads, background services,
invalid/stopped/retried treatment, adverse and worst-case preservation,
independent review, and the rule for selecting or retaining reference tiers.
Confirm that both required targets must pass independently and neither an
optional row nor any aggregate can rescue failure.

## RXC-017 - Data rights, privacy, retention, and incidents

Approve the closed result schema, opaque labels, redaction, raw-media and
skeleton prohibition, temporary buffers, hosted/probe traffic, custody,
access, retention, verified deletion, adverse-evidence preservation, and
incident response. Who verifies that no raw media, name, face, voice, exact
age, serial, stable identifier, credential, account/profile/save value, path,
query URL, environment/argument value, service body, arbitrary message, typed
text, or free text enters repository or release evidence?

## RXC-018 - Operation, qualification, and publication authority

Who may purchase, receive, assemble, install, connect peripherals, operate a
camera or controller, use a participant or hosted service, inject faults,
interrupt power, pressure storage, update, rollback, rebuild, reinstall, and
handle any destructive data disposition? Separately, who may declare a target
qualified, approve cost results, select or change a reference tier, publish
results, or expand support? State explicitly what I-173 cannot close or claim.
