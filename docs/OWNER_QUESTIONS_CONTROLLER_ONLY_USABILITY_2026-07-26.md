# Owner questions — controller-only usability campaign

Date: 2026-07-26

Scope: unresolved I-155 choices that must be frozen before any physical target,
controller, participant, fault, recording or usability collection. This
document grants no operational or publication authority.

Tracked plan:
`benchmarks/controller-only-usability/cross-tier-controller-only-usability-plan-v1.json`

| ID | Priority | Owner decision needed | Why it blocks | Required evidence or choice | Decision owners |
|---|---:|---|---|---|---|
| CU-001 | P0 | Which exact ordinary x86 Linux and Pi hardware/OS/compositor/browser/SDL/runtime tuples enter I-155? | A Windows, WSL, desktop or unqualified target cannot establish the appliance flow. | Bind complete passing target, boot, controller, kiosk, TV, visual and power results plus exact versions/digests. | Project owner, platform, release, QA |
| CU-002 | P0 | Which physical TV, audio route, power controls, seating distance, network and normal room state apply? | Screen legibility, physical feedback, network failure and terminal shutdown state need one reproducible environment. | Freeze received inventory, connections, calibration, physical-state oracles, safety and restoration protocol. | Household, AV, network, power, QA, project owner |
| CU-003 | P0 | Which supported controller samples, transports, mappings and glyphs must each target run? | “Controllers just work” cannot be inferred from one model or synthetic Gamepad input. | Select standards-conformant wired, Bluetooth and receiver samples; bind exact mappings, canonical actions, ambiguity exclusion and no-manual-setup policy. | Input, accessibility, platform, project owner |
| CU-004 | P0 | Which exact remote-web, local-web, native/Godot and Libretro releases and play tasks represent each lane? | A fixture, process start or manifest shape does not prove a real controller-only play loop. | Freeze release/manifest/artifact digests, rights/admission, target qualification, declared play task, save/network behavior and fault applicability. | Product, games, runtime, release, rights, QA |
| CU-005 | P0 | How many distinct school-age-child and adult participants are required, and how many sessions may each perform? | The fixed matrix defines sessions but not independent cohort strength, fatigue or learning limits. | Freeze cohort sizes, inclusion/exclusion, session caps, rest, counterbalancing, prior-exposure handling and no post-result exclusion. | Research, accessibility, safety, privacy, project owner |
| CU-006 | P0 | What consent, child assent, guardian, accessibility, comfort and stop protocol permits collection? | Human and child evidence cannot begin under repository-planning authority. | Approve recruitment, consent/assent, guardian presence, privacy, stop/discomfort rules, incident response, compensation and verified deletion. | Project owner, privacy, legal, safety, research |
| CU-007 | P0 | What exact instructions and scoring distinguish comprehension, a guess, a wrong action, assistance, abandonment and invalid harness behavior? | “No guesswork” must be independently falsifiable and cannot rely on operator interpretation after the run. | Freeze neutral prompts, allowed onboarding, clocks, observer codes, first-attempt rules, assistance boundary, invalid-attempt treatment and adjudication. | UX research, accessibility, QA, project owner |
| CU-008 | P0 | What detailed task, controller discovery, Home/Back/Pause/Resume/Exit/Shutdown and reconnect timing gates apply? | D-106/D-130 fix broad limits, but task-level p95/worst and recovery response gates remain open. | Freeze every task clock boundary, p95/worst threshold, physical/input uncertainty, samples and no-aggregate-rescue policy. | UX, input, performance, QA, project owner |
| CU-009 | P0 | What loading, fault, Details, Retry, Exit and recovery comprehension threshold qualifies each persona/runtime? | Visible copy is not proof that a child or adult understands state and escape paths. | Freeze closed comprehension questions/tasks, first-attempt threshold, fault schedule, retry failure treatment and independent scoring. | UX research, accessibility, runtime, QA |
| CU-010 | P0 | Which safe fault injectors and stop/restoration rules exercise every recovery scenario? | Network, controller, focus, fullscreen, process, hang, crash and power faults can mutate state or strand a participant. | Bind exact injectors, scope, timing, expected state, cleanup/rollback, evidence, abort and environment restoration. | Platform, network, input, operations, safety, QA |
| CU-011 | P0 | What screen-only recording, input-ledger, clock, metadata-removal, retention and deletion protocol is allowed? | The required session recording must not become room, participant, controller-identifier, credential, path or entered-text collection. | Freeze capture boundary, encryption/access, detached digest, redaction, metadata removal, review sampling, retention, deletion proof and incident response. | Privacy, security, research, QA, project owner |
| CU-012 | P0 | What closed issue taxonomy, blocking severity and closure evidence qualify a cell? | An unstructured issue log can hide wrong actions or reinterpret defects after results. | Freeze codes, severity, affected-cell binding, blocking threshold, duplicate policy, first-failure retention, repair/retest and independent closure review. | QA, UX, product, project owner |
| CU-013 | P1 | What independent review, ranking, product-guidance, expiry and regression policy may follow complete results? | A technical pass cannot automatically change supported-controller, runtime, compatibility or product promises. | Require both target results, every required cell, independent review, named disposition scope, exclusions, expiry and retest triggers. | Project owner, product, input, QA, accessibility |

Each resolution should state the question ID, selected value or protocol,
effective version/date, approving owners, evidence digest, exclusions, expiry
and retest trigger. A preference without the named evidence does not open the
campaign.
