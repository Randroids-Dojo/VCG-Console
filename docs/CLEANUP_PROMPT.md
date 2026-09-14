# VCG-Console cleanup execution prompt

Work in `C:\Dev\VCG-Console`. Make this a lean, coherent, maintainable console
project by addressing the 18 findings in
[PROJECT_REVIEW_2026-09-13.md](PROJECT_REVIEW_2026-09-13.md). The reviewed baseline
is `15806d3c61c7fe79d04bb3c31f6964905e9bf7ae`; recheck current state before editing.
The review is a starting inventory, not permission to preserve a bad design or
to delete useful code mechanically.

Deliver working cleanup, not another proposal. Use the execution table in that
review as the single progress record. Continue through bounded, reviewable
changes until the software findings are resolved and the checks below pass.
If a proposed finding is disproved, record the current source/test evidence
instead of making an unnecessary change. An unresolved software finding is not
complete merely because it has been documented.

## Working rules

- Read the current repository guidance, especially `CLAUDE.md`. Preserve
  concurrent changes and existing saves/profiles. Inspect Git state and open
  PRs before overlapping work; create an isolated worktree only when needed.
  Never reset, stash, clean, or overwrite another change. Stage only owned paths
  if committing. Branch deletion, deployment, publishing, purchases, machine
  policy changes, and messages to other people are outside this cleanup.
- Prefer deletion of proven dead material, a single current source of truth,
  and small functions/modules with clear resource ownership. Introduce shared
  code only for demonstrated repetition. Do not add a framework, dependency,
  abstraction layer, roadmap, or policy document merely to look organized.
- Preserve Rust/native authority, browser containment, strict schemas and
  discriminators, signature-first intake, filesystem bounds, opaque profile
  IDs, durable replay, privacy rules, and exact upstream pins. Do not weaken
  tests, budgets, security boundaries, or evidence gates to get green output.
- Separate the usable appliance from synthetic lab/rehearsal state. Keep the
  simulator and existing games useful. Do not invent native profile authority,
  real updates, supported hardware, performance, license clearance, or a
  working external service. Keep actual player controls concise and truthful.
- Retain the existing visual identity. Fix layout, focus, useless copy, and
  inconsistent token ownership without imposing a different style preset.
- Start with a failing behavioral reproduction for actual bugs. Add tests for
  meaningful contracts and regressions, not for file moves or implementation
  trivia. Report only checks actually run and distinguish OS/tool failures.

## Ordered work

1. **Restore trustworthy checks (R04–R06).** Refresh frozen dependencies and
   capture baseline results. Correct the dependency inventory/notices and add
   their deterministic check to CI. Replace fragile root test filename lists
   with intentional suite discovery, including privacy and transport tests.
   Add strict scripts typechecking and fix the real diagnostics. Give the
   existing Python/Godot checks an explicit home; diagnose the recorded Godot
   editor exit rather than changing its result filter to hide the failure.
2. **Fix lifecycle and display defects (R01–R03).** Cancel stale camera startup
   across every await and prove late streams close. Reflow the 720p top bar;
   extend TV geometry checks to rendered text bounds. Reproduce the serial
   Bluetooth/API stall and isolate long operations with bounded concurrency
   while preserving mutation order, request bounds, and shutdown behavior.
3. **Make routine changes affordable (R09–R10).** Establish common strict
   evidence primitives and migrate repeated validators by family. Separate
   measured baselines from independent acceptance logic, remove the need to
   rewrite validators from their output, and narrow unnecessary umbrella-doc
   coupling. Keep old evidence truthful and traceable. Regenerate affected
   outputs only after reviewing their changed source dependencies; never run a
   blanket hash-update command as a substitute for that review.
4. **Separate appliance and development surfaces (R07–R08).** Create explicit
   appliance/lab build and navigation boundaries. Keep hostile/stalled fixtures,
   sample profiles/progress, and rehearsal controls out of the ordinary
   appliance. Implement a small supported runtime serving path for built files
   that shares the required header policy and does not need writable
   `node_modules` or runtime TypeScript compilation. Update the Pi service and
   bootstrap checks; preserve host-owned identities and existing launch paths.
5. **Simplify architecture and design ownership (R11–R13).** Split frontend
   lifecycle, navigation, transport, and styles along actual responsibilities.
   Split native import/provisioning/schema/recovery and CLI composition without
   changing public behavior or durable formats. Consolidate the current visual
   contract and remove the fixed greeting/filler. Keep useful history clearly
   superseded. Measure built output and compare affected screens and behavior.
6. **Finish tooling and repository housekeeping (R14–R18).** Align prerequisite
   checks with the root Node engine requirement. Bound asset body consumption
   and retain download cancellation through verification. Resolve dual OpenCV
   ownership using compatible isolated environments if necessary. Create a
   concise current documentation path, preserve evidence/history, and remove
   `a.txt` plus any additional proven scratch duplicates. Update the existing
   development instructions to match the commands people should now use.

R18 can be done early as a small independent deletion. Reorder other steps when
dependencies warrant it, but do not leave the reproduced P1 defects behind a
large speculative refactor. The user has authorized routine cleanup and fixes;
do not stop to reconfirm reversible implementation choices.

## Acceptance

- R01–R18 each has a verified resolution or evidence-backed finding dismissal
  in the review table. New material defects uncovered during the work are
  fixed within scope or explicitly tracked there; do not bury them in prose.
- Camera stop/close wins over late initialization/permission/playback results.
  Bluetooth scan/pair does not starve status or launch cancellation. Existing
  simulator, input fallback, launch/recovery, and game flows remain functional.
- Navigation and critical text are readable and contained at 720p, 1080p, 4K,
  and supported setup widths. Controller/keyboard focus, Back/Home, high
  contrast, and reduced-motion parity remain usable. Capture and inspect the
  affected views. Preserve the TV contract floors and refresh applicable
  browser evidence using actual observations.
- The ordinary appliance has no synthetic profile/progress administration,
  fake update action, or browser-probe fixture pages. Lab tests still exercise
  those facilities explicitly. Runtime serving passes the same policy/asset
  checks without a writable dependency tree.
- A frozen install, complete strict typecheck, intended unit/research suites,
  build, browser tests, schema/catalog checks, and deterministic compliance
  checks pass. Rust fmt, locked Clippy, and locked workspace tests pass wherever
  the required tools can run; Linux/Pi-specific code gets the applicable CI
  compile/lint/script checks. Preserve and run affected negative/recovery tests.
- Existing Python/Godot code has repeatable commands, declared environments,
  and meaningful smoke coverage. Keep any local engine/policy limitation
  separate from an application failure; resolve software causes before closure.
- No blind deletion of benchmark evidence, licenses, source pins, persistent
  user data, or concurrently modified files. No artificial test/line/file-count
  target. Final source has fewer competing owners and repeated primitives, with
  a concise path for the next developer to build, run, and verify it.
- Hardware qualification, physical-TV acceptance, OS policy approval, and
  unresolved product/license decisions are outside the software cleanup goal.
  Record these honestly; do not invent approval, disable the gate, or bypass
  Windows Application Control. Finish all independent machine-actionable work.

At completion, report the main behavior and maintenance improvements, actual
test results, remaining external limitations, and exact changed-file/Git state.
Mark the cleanup goal complete only after its software work is actually done.
