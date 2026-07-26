# Cross-tier boot, resume, and launch timing campaign — 2026-07-25

Status: I-023 campaign plan complete; physical execution blocked

Authority: D-034, D-095, D-106, D-118, D-119, D-130, D-166, I-023,
I-029, I-107, I-153, I-154, I-155, I-173, I-197, I-207, Q-047, Q-203,
Q-260, Q-267, Q-268, Q-269

## Outcome

`benchmarks/boot-resume-launch-timing/cross-tier-timing-plan-v1.json`
pre-registers the first shared boot, resume, low-power idle/wake, and launch
timing campaign. It carries the same observable timer boundaries across the
required ordinary x86-64 native-Linux premium target and Pi 5/AI HAT+ 26
lower-cost target. Steam Machine is a later optional row under D-119.

The artifact is deliberately a zero-result plan. No physical power operation,
boot, suspend, idle, wake, launch, controller action, camera/privacy-state
probe, network fault, hosted interaction, power measurement, or target
qualification was performed.

## Frozen source boundary

The plan binds eight current sources by normalized SHA-256:

- the prototype timing and accountless/offline contracts;
- the power/recovery state-machine design;
- the launcher timing and power-lifecycle policy implementations;
- the hosted-browser supervisor;
- the blocked ordinary x86-64 Linux qualification plan; and
- the blocked Pi 5/Hailo image plan.

Those sources establish the intended contract and current software boundary.
They do not prove that a target adapter performs an operating-system power
transition, that a process exit changes device power state, or that UI state
proves camera, microphone, display, write, or update safety.

## Target boundary

| Target | Role | Strategy | Common-comparison status |
|---|---|---|---|
| Ordinary x86-64 native Linux | Required premium reference | Unset pending Q-270 | Required |
| Pi 5 plus AI HAT+ 26 | Required lower-cost reference | Low-power launcher idle under D-095 | Required |
| Steam Machine | Optional later compatibility | Platform suspend under D-095 | Cannot rescue either required target |

Windows and WSL2 cannot qualify the ordinary native-Linux row. Steam Machine
cannot substitute for either required target. Every hardware, image, runtime,
adapter, timing harness, wake-source, power-meter, and hardware-state oracle
digest remains `null`.

## Timing paths

Every target declares eight paths. Each claimed target/path cell requires
twenty trials:

| Path | Timer start | Passing end | Limit |
|---|---|---|---:|
| Accountless offline cold boot | Physical power application observed outside the target | Launcher visibly accepts and responds to supported controller input | 60 s |
| Accountless offline warm resume | Supported deliberate wake observed outside the sleeping/idle target | Prior safe state or launcher visibly accepts and responds to supported controller input | 5 s |
| Offline obstacle launch | Deliberate controller selection accepted by launcher | Obstacle sample visibly responds to intended gameplay input | 15 s |
| Offline selected signed package | Deliberate controller selection accepted by launcher | Package visibly responds to intended gameplay input | 15 s |
| Offline retro 2048 | Deliberate controller selection accepted by launcher | Retro title visibly responds to intended controller input | 15 s |
| Online VibeBots | Deliberate controller selection accepted by launcher | Title responds to input or console reports an exact observable phase | 30 s |
| Online Mi Casa Es Su Casa | Deliberate controller selection accepted by launcher | Title responds to input or console reports an exact observable phase | 30 s |
| Online Determined | Deliberate controller selection accepted by launcher | Title responds to input or console reports an exact observable phase | 30 s |

The two required targets produce 16 required cells and 320 required trials.
The optional Steam row is a separate 8 cells and 160 trials. Its absence or
failure cannot rescue or invalidate the x86/Pi common comparison, and it cannot
be counted toward the required schedule.

Every path also requires branded visible feedback within 250 ms. Warmups and
failed attempts cannot be discarded or replaced. All attempts, failures, and
retries are published with nearest-rank p50, p95, and worst duration.

## Exact claim boundaries

The timer begins at the external deliberate action, not at process start,
browser navigation, first paint, or a convenient internal callback. Cold-boot
timing must span physical power application. Resume timing must use a clock that
continues independently while the target sleeps or idles.

Local paths end only after observable response to intended gameplay input.
For hosted paths, D-106 permits an exact truthful current phase to satisfy the
30-second launch-timing gate. That evidence does not establish playability,
controller ownership, service correctness, compositor focus, visual response,
or successful completion. First pixels, load, readiness, and liveness remain
separate observations.

Every required trial must meet its deadline. A p95, aggregate, faster target,
optional target, retry, or replacement trial cannot rescue a failed required
trial or cell.

## Idle, privacy, and wake oracles

Before an idle or suspend transition can count, hardware-backed evidence must
show:

- launch admission is closed and the game is stopped or suspended as declared;
- tracker and camera capture have stopped;
- camera-active indication has stopped;
- the camera microphone remains disabled at the operating-system boundary;
- ordinary input is released except for the qualified wake path;
- writes are quiesced and update state is safe;
- unnecessary workloads have stopped; and
- the display is dimmed or blanked.

Wake completion additionally requires the launcher or prior safe state,
display, and supported controller input to be ready, while camera/tracker remain
stopped until explicitly needed and gameplay never resumes passively.

Controller, remote, HDMI-CEC, and physical power button are candidate wake
sources, not assumed capabilities. Each claimed source requires twenty trials
on the exact target. UI labels cannot prove device privacy state, and process
exit cannot prove device power state.

## Metrics and open gates

Every attempt records exact target/path/repetition identity, status, failure
code, monotonic start/feedback/end timestamps, visible branded state, end
oracle, power trace, hardware privacy-state transitions, wake source and first
accepted action, process/service lifecycle, sanitized network state, and all
configuration/harness/oracle digests.

Launch and feedback limits plus zero failed required trials are fixed. Idle
watts, resume energy, and maximum transition temperature remain `null` for
every target. Q-269 already owns the premium x86 thresholds; Q-271 asks for the
cross-tier timing campaign's remaining Pi and optional-Steam thresholds and
instrument rules.

## Authority and blockers

Only repository planning was authorized. Hardware access, physical power
control, operating-system mutation, service/account mutation, network fault
exercise, participant collection, diagnostic retention, and purchases remain
false. Raw frames/video, audio, skeletons, credentials, content bodies,
cookies/storage values, URL parameters, typed/generated text, participant IDs,
and stable tracked machine identifiers are prohibited.

Execution remains blocked on exact target tuples, Q-270 through Q-272, target
power adapters, accountless offline runtimes, hosted-service authority,
physical wake-source inventory, hardware-backed state oracles, physical trial
authority, and a complete result/comparison ledger.

## Validation

Run:

```powershell
node scripts/validate-boot-resume-launch-timing-plan.mjs
node --test scripts/validate-boot-resume-launch-timing-plan.test.mjs
```

The validator enforces exact source bindings, target roles and substitution
rules, path timer boundaries and deadlines, required-versus-optional schedule
arithmetic, idle/wake oracles, metrics, fixed and open gates, data/authority
denials, blockers, zero-result state, strict UTF-8, and canonical JSON.

Twenty-six focused tests accept the tracked plan and reject source drift,
substitution, undeclared fields, Windows promotion, target/path changes,
premature idle selection, invented hardware or wake proof, relaxed deadlines,
reduced trials, schedule drift, discarded warmups, privacy-gate removal, UI-only
privacy claims, invented power ceilings, phase/playability conflation, optional
target rescue, physical authority, fabricated results, noncanonical JSON,
UTF-8 BOM input, and bare carriage returns.
