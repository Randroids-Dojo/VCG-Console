# Cross-tier controller lifecycle qualification campaign — 2026-07-25

Status: I-152 strict plan complete; physical execution and result schema blocked

Authority: D-029, D-095, D-116, D-123, I-117, I-128, I-149, I-150,
I-151, I-152, I-197, I-207, Q-067, Q-101, Q-227, Q-228, Q-229, Q-230,
Q-231, Q-232

## Outcome

`benchmarks/controller-qualification/cross-tier-controller-plan-v1.json`
turns the existing controller lifecycle protocol into a strict zero-result
campaign envelope. It freezes the required target roles, controller sample
roles, 51 lifecycle scenarios, twenty-valid-cycle floor, metrics, zero-tolerance
failures, data policy, execution authority, blockers, and claim boundary.

No controller was attached, borrowed, purchased, mapped, assigned, faulted, or
qualified. No SDL3 producer, privileged compositor routing, target Linux image,
physical device, battery source, response threshold, applicability matrix,
cycle schedule, event ledger, or compatibility result exists.

## Frozen source boundary

The plan binds eight current sources by normalized SHA-256:

- the controller qualification protocol and mapping contract;
- the browser Gamepad adapter and portable canonical mapping implementation;
- the idle/wake policy model;
- the cross-tier timing plan; and
- the blocked ordinary x86-64 Linux and Pi target plans.

The campaign intentionally does not bind the concurrently owned native-host
implementation. Browser adapters and pure policy models remain software-contract
evidence only; neither can establish SDL3 device intake, physical event routing,
compositor privilege, focus resistance, target behavior, or compatibility.

## Target boundary

The ordinary x86-64 native-Linux premium target and Pi 5/Hailo 26 lower-cost
target are both required. Steam Machine is a separate optional later row. Its
results cannot rescue either required Linux target. Windows and WSL2 can debug
the harness but cannot qualify a required row.

Each target still needs exact digests for hardware, operating-system image,
SDL3, mapping database, compositor, browser, native host, retro runtime, sample
game, USB/radio topology, harness, clock calibration, and focus/fault injector.
All remain `null`.

## Controller sample boundary

The plan reserves five roles:

| Role | Baseline condition | Expected disposition |
|---|---|---|
| First-party standard controller | Required | Must pass |
| Second-vendor standard controller | Required | Must pass |
| 2.4 GHz receiver controller | Required only if that support is claimed | Must pass if claimed; otherwise visibly unsupported |
| Generic ambiguous controller | Required fail-closed coverage | Zero semantic authority unless an approved guided mapper passes |
| Simultaneous cross-vendor pair | Required | Must pass assignment and isolation coverage |

Exact model, revision, firmware, transport, sample count, device-manifest, and
mapping-manifest fields remain empty pending Q-227 and Q-232. Wired and wireless
modes are separate configurations. Material firmware and hardware revisions are
separate unless evidence proves equivalence. Family resemblance, a database
entry, or one successful connection cannot establish support.

## Scenario catalog

The plan fixes 51 individually named scenarios across seven groups:

| Group | Scenarios | Coverage |
|---|---:|---|
| Discovery and hot-plug | 7 | Cold boot, launcher idle, hosted/native/retro loading, overlay, missed backend event |
| Disconnect, reconnect, replacement | 7 | Neutral/held disconnect, slot changes, replacement, receiver sleep, backend restart |
| Sleep, suspend, wake, radio | 6 | Controller sleep, console suspend, launcher idle, Bluetooth restart, USB reset, coexistence load |
| Simultaneous assignment | 8 | Order, simultaneous input, reconnect, replacement, correction, mixed mapping, Pause ownership |
| Ambiguous mapping | 7 | Zero authority, no guessed reserved controls, guided mapper denial and generic glyphs |
| Reserved actions under hostile focus | 8 | Fullscreen, pointer lock, focus loss, hang/load, overlay churn, crash, suppression, compositor restart |
| Battery and power reporting | 8 | Charging through replacement, including unavailable and stale states |

Every applicable target/controller/transport/revision/scenario cell requires at
least twenty valid cycles. An invalid harness cycle is preserved and rerun; it
never becomes a pass. A valid product failure remains a failure and cannot be
replaced. One transport, firmware, revision, target, average, or aggregate
cannot rescue another cell.

The final applicability matrix, required cell count, and scheduled cycle count
remain `null`. Computing them before Q-227 selects exact samples/transports and
Q-232 freezes repetition and claim scope would create a misleading total.

## Zero-tolerance behavior

The campaign permits zero:

- missed, phantom, duplicate, or misordered lifecycle transitions;
- stuck or fabricated actions;
- Home, Back, or Pause deliveries to a game;
- swallowed reserved actions;
- semantic actions from an ambiguous device before approved mapping;
- wrong or silent player assignments;
- old-epoch actions after disconnect or replacement;
- false battery claims; and
- keyboard/mouse recoveries in a claimed controller-only path.

Every applicable cell must pass. Unsupported or ambiguous behavior cannot be
counted as compatibility. Game focus can never own Home, Back, or Pause, and
durable device identity can never assign a player.

Detection, reconnect, Home/Back/Pause p95/p99/worst, battery freshness, and
physical-sample-count thresholds remain `null` under Q-230 through Q-232. The
plan cannot choose them after observing physical results.

## Evidence and privacy

Required metrics cover ordered lifecycle events, session-local identities and
epochs, latency distributions, every canonical press/release and recipient,
assignment, mapping state, synthesized releases, reserved-action console/game
delivery, battery source/freshness, controller-only recovery, harness validity,
and every target/device/schedule digest.

Tracked evidence may contain only opaque session-local identifiers, closed event
codes, monotonic timing, and exact manifest digests. Raw USB/Bluetooth
descriptors, serials, MAC addresses, usernames, filesystem paths, free-text
device names, unplanned raw input, gameplay/save/profile content, and stable
device identifiers are prohibited.

## Authority and blockers

Only repository planning was authorized. Target access, device loan/purchase,
physical execution, Bluetooth/USB faults, compositor/process faults, mapping
persistence changes, participant collection, and diagnostic retention remain
false.

Q-227 through Q-232 remain the owner-question set. Execution additionally
requires exact target/SDL/runtime tuples, physical/fault authority, privileged
reserved routing, controller roster/assignment/mapper/glyph/battery UI, a
digest-bound applicability matrix and schedule, a strict event-ledger/result
schema, and the complete per-target report.

## Validation

Run:

```powershell
node scripts/validate-controller-qualification-plan.mjs
node --test scripts/validate-controller-qualification-plan.test.mjs
```

The validator enforces exact sources, target and sample roles, all 51 unique
scenarios, applicability, cycle policy, metrics, fixed-zero and open gates,
privacy, authority, blockers, zero-result state, strict UTF-8, and canonical
JSON.

Twenty-six adversarial tests accept the tracked plan and reject source drift,
substitution, hidden fields, browser/native promotion, optional-target rescue,
invented SDL or device evidence, target/sample/scenario changes, family
resemblance, guessed ambiguous mapping, duplicate scenarios, reduced cycles,
failure replacement, weakened reserved-action gates, post-hoc response
thresholds, inferred battery state, stable identifiers, physical authority,
fabricated results, noncanonical JSON, UTF-8 BOM input, and bare carriage
returns.
