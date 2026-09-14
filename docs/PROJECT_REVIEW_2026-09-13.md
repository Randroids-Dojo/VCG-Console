# Project cleanup review — 2026-09-13

Baseline: `15806d3c61c7fe79d04bb3c31f6964905e9bf7ae` on `main`.
The working tree was clean and GitHub reported no open pull requests.
Execution instructions: [CLEANUP_PROMPT.md](CLEANUP_PROMPT.md).

## Assessment

The project has substantial working code and useful defensive tests. Its main
maintenance problem is accumulated prototype infrastructure: research records,
rehearsals, production paths, generated evidence, and test fixtures share too
many entry points and sources of truth. Cleanup should preserve the strong
runtime boundaries while reducing that coupling.

There are 18 actionable findings below. Two user-visible defects were
reproduced despite the passing default suites: a late camera start survives a
stop, and navigation text overlaps at 720p. The compliance check also fails.
Other findings are identified as source-confirmed maintenance problems rather
than being presented as reproduced runtime failures.

## Coverage and baseline

Inventory covered all 1,230 tracked files. Manual review followed the browser
entry points, launcher and tracker lifecycle, native API and launch/provisioning
paths, contract packages, CI/build/bootstrap tools, representative evidence
generators/validators, documentation indexes, examples, experiments, schemas,
catalog, and compliance artifacts. Automated inventory, reference scans, and
tests supplemented that review; this is not a claim that every line received
the same manual scrutiny or that no defects remain.

| Area | Tracked files | Maintenance signal |
| --- | ---: | --- |
| `apps/` | 146 | Svelte launcher plus imperative lab, fixtures, tests, and one large stylesheet |
| `native/` | 53 | Two Rust workspace crates, standalone fuzz crate, large persistence/import modules |
| `packages/` | 114 | Seven TypeScript contract packages and a retro development package |
| `scripts/` | 297 | Approximately 98,000 lines including tests; extensive repeated evidence plumbing |
| `docs/` | 387 | Approximately 57,500 lines; flat current and historical material |
| `benchmarks/`, `compliance/` | 164 | Valuable provenance, but broad source bindings and stale dependency output |
| `catalog/`, `schemas/` | 31 | Current validation passed |
| `examples/`, `experiments/` | 24 | Godot, TV fixture, and Python paths need explicit verification ownership |

Local evidence and reproduction programs are in
[`artifacts/cleanup-review/`](../artifacts/cleanup-review/), which is ignored.
No application source, tracked generated evidence, or lockfile was changed by
the review. A frozen install repaired one missing local workspace symlink.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile unchanged; restored root `@vcg/retro-import-contract` link |
| `pnpm typecheck` | Passed; Svelte reported zero errors and warnings |
| `pnpm test` | Passed before and after frozen install: 1,342 root Node tests plus 820 workspace tests |
| `pnpm test:e2e` | 89 passed in 3.3 minutes, including a production build |
| `cargo test --workspace --locked` | Passed: 444 library, 30 host-binary, 12 provisioner tests; five intentionally ignored library helpers |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Passed |
| `pnpm native:verify` | Stopped at formatting: Windows Application Control blocked `cargo-fmt`, OS error 4551; lint/tests were then run separately |
| Schema export `--check`, manifests, benchmark plan | Passed; benchmark validation is plan validation, not a measured hardware run |
| `pnpm validate:data-exclusion` | 12 passed; these are missing from default CI |
| Motion transport payload tests | Five passed; missing from default CI |
| `pnpm validate:compliance` | Failed after frozen install: committed SBOM is stale |
| Expanded strict typecheck of all `scripts/**/*.ts` | Eight diagnostics after install, including missing `ws` types, implicit `any`, and an invalid narrowing |
| Python experiment helper tests | Three passed using existing `artifacts/rtmo-venv`; the Python environment was not rebuilt |
| `pnpm validate:godot` | Four contract tests passed; Godot 4.7.1 editor import exited 3221225477; main-scene check was consequently not reached |
| Visual inspection | Stable 1080p home/settings/profiles and 720p profiles captures; measured 720p navigation text collision |
| Static local Markdown links | No missing file destinations detected by the scan; anchors and external links were not exhaustively validated |

The older Windows subprocess startup-timeout issue was checked against current
source: `fast_policy` now uses five seconds, with the short timeout isolated to
the timeout test. It is not being re-filed from historical notes.

Linux/Pi execution, physical controllers/cameras/TVs, long hardware campaigns,
native fuzz execution, and full Godot exports were not performed. The Godot
editor exit and Windows formatting restriction are verification limitations,
not established application-code defects.

## Findings

P1 means fix before further feature work. P2 means substantive cleanup or
reliability work. P3 means low-risk housekeeping. Each finding starts open;
record its outcome and verification in the table at the end.

### R01 · P1 · A stopped camera can start again when permission resolves

**Reproduced.** [tracker.ts](../apps/console-lab/src/tracker.ts#L75) checks
`#running` before asynchronous initialization and permission, then sets it true
after those awaits. `stop()` increments the run ID, but pending startup never
checks it. The controlled reproduction produced `loading → requesting-camera
→ stopped → running`, attached the late stream, and stopped zero tracks before
cleanup. Switching to the simulator reaches `stop()` through `startReplay()`.

Give startup a cancellable generation and single owner. A stale permission,
backend, or video-play result must dispose its resources without publishing
running/health state. Test stop, close, overlapping starts, and late failures
with deferred promises. Preserve worker fallback and normal restart behavior.

### R02 · P1 · 720p navigation text overlaps while TV tests pass

**Visually and geometrically reproduced.** At 1280×720 the Home text extends to
x=394.30 while Motion text begins at x=387.77; other labels also collide.
The [navigation CSS](../apps/console-lab/src/styles.css#L393) shrinks button
boxes below their text-plus-padding needs. The
[TV measurements](../apps/console-lab/tests/tv-conformance.spec.ts#L20) measure
element boxes, which do not expose the overflowing text ranges in this case.

Reflow the top bar at constrained widths and measure rendered text containment
as well as action boxes. Verify 720p, 1080p, 4K, setup widths, focus, and reduced
motion. Keep the 24px critical-text, 48px target, and 5% safe-area floors.
Evidence: `profiles-720p.png` and `screens.json` in the local review directory.

### R03 · P1 · Bluetooth work blocks the only host API accept loop

**Source-confirmed; concurrent runtime reproduction still required.**
[host_api.rs](../native/vcg-host/src/host_api.rs#L408) handles each connection
inline. Its POST handler calls `service.scan()`/`pair()` synchronously.
[bluetooth.rs](../native/vcg-host/src/bluetooth.rs#L15) permits an eight-second
scan and up to 28 seconds for pairing, while ordinary browser status requests
time out after 1.5 seconds. A scan therefore prevents that same API thread from
servicing status and launch/cancel requests until the operation completes.

Reproduce with a controlled slow Bluetooth runner, then isolate long operations
using bounded concurrency or explicit jobs. Keep request limits, authentication,
mutation serialization, shutdown ownership, and cancellation behavior intact.
Do not introduce unbounded thread creation or a broad framework migration.

### R04 · P1 · Dependency inventory is stale and CI does not check it

**Reproduced after frozen install.** `pnpm validate:compliance` fails. Running
the same generator with output redirected to the review directory yields 146
components versus the committed 139. Missing entries are `vcg-cursor-nudge`,
Inter, Ajv, and four Ajv dependencies; existing component records are unchanged.
[ci.yml](../.github/workflows/ci.yml) never runs this check.

Regenerate the SBOM and dependency notices and put their read-only check in CI.
Include the copied Inter font/license in the asset-provenance story and remove
stale hand-maintained inventory counts in
[RELEASE_COMPLIANCE.md](RELEASE_COMPLIANCE.md#L19). Test deterministic generation
on the supported operating systems. Preserve the explicit project-license and
pose-model-license release blockers; cleanup does not resolve those decisions.

### R05 · P2 · Hand-listed test commands omit useful tests

**Source-confirmed; omitted tests pass individually.** The default test command
and its nested scripts omit `device-only-data-exclusion.test.mjs`,
`native-diagnostics-data-exclusion.test.mjs`,
`local-diagnostics-data-exclusion.test.ts`, and
`motion-transport-payload.test.mjs`. CI does not otherwise execute them. The Pi
boot test also sits outside `pnpm test`, but does have its own CI job.

Replace growing filename lists in [package.json](../package.json) with small,
explicit test suites whose file discovery cannot silently miss new tests. Keep
fast runtime checks, research evidence, browser tests, and platform checks
identifiable, and ensure CI runs their complete intended union. Give the Godot
sample and Python helper tests explicit CI ownership; investigate the observed
Godot editor failure without weakening its validator or relabeling it a pass.

### R06 · P2 · Root TypeScript tools escape the strict project configuration

**Reproduced with expanded strict checking.** The root typecheck command
hand-lists six files and does not enable `strict` or extend
[tsconfig.base.json](../tsconfig.base.json). Eight other non-test TypeScript
tools are not named, including schema/catalog generation and benchmark tools.
After repairing the local install, strict checking still reports eight
diagnostics: missing `ws` declarations, callback types, a `never.code` access,
and untyped diagnostic-test boundaries.

Add a scripts TypeScript project extending the shared strict settings. Include
all intended TypeScript tools/tests, declare actual development dependencies,
and use explicit types at JavaScript boundaries. Do not hide the errors behind
blanket `any`, ignores, or a weaker compiler configuration.

### R07 · P2 · Normal launcher paths expose sample state and rehearsals

**Source- and UI-confirmed.**
[Launcher.svelte](../apps/console-lab/src/launcher/Launcher.svelte#L95) eagerly
constructs demo profiles/progress and defaults to Randy. Profiles displays four
sample unassigned items. Search and Motion expose synthetic administrative and
session rehearsals. Settings offers
[Check for updates](../apps/console-lab/src/launcher/SettingsView.svelte#L357),
whose only action is a toast saying no update service is connected. The default
[Vite inputs](../apps/console-lab/vite.config.ts#L204) also ship eleven additional
fixture HTML pages, including hostile/stalled browser probes.

Establish explicit appliance and lab/rehearsal entry points. Keep synthetic
fixtures available to development/tests while excluding them from the normal
appliance build and navigation. Render real host capabilities or a clear
unavailable state. Preserve the usable simulator and games. Do not replace
existing host-owned profile IDs, saves, or local state with invented identities;
profile authority and any migration must remain explicit.

### R08 · P2 · Appliance startup requires the development toolchain at runtime

**Source-confirmed.**
[vcg-console-server.service.in](../scripts/pi/systemd/vcg-console-server.service.in#L17)
runs `vite preview` from the checkout. The service grants write access to
`node_modules` specifically because Vite rebundles its configuration at startup.
This couples appliance availability to development dependencies and config
compilation. Vite documents preview as a local build-preview tool, not a
production server: [official deployment guide](https://vite.dev/guide/static-deploy.html).

Provide a small supported runtime serving path for the built appliance assets
that needs no writable dependency tree or TypeScript compilation. Reuse one
browser-header policy across runtime and development. Verify loopback binding,
content types, CSP, isolation, camera policy, asset loading, startup/shutdown,
and hostile-path rejection. Do not replace it with a generic server that drops
the headers the camera depends on.

### R09 · P2 · Copied evidence helpers already disagree

**Source-confirmed.** Validators define `exactKeys` in 83 files,
`normalizedText` in 41, and `validateSources` in 47. These are named-function
counts, not a claim that all bodies are identical. There is real semantic drift:
[the source-binding checker](../scripts/validate-source-bindings.mjs#L32)
rejects a UTF-8 BOM, while
[the memory-plan digest](../scripts/validate-pi5-memory-tier-plan.mjs#L33)
uses a decoder that strips it before hashing.

Extract the genuinely common byte decoding, digest, bounded file, path, and
shape primitives. Migrate validator families incrementally, with malformed
UTF-8/BOM/CRLF/bare-CR/path/size tests against the shared contract. Keep
domain-specific requirements, canonical field-order requirements where
intentional, and evidence/qualification boundaries explicit.

### R10 · P2 · Evidence refresh rewrites validators and fans out through documents

**Source-confirmed.**
[sync-launcher-evidence-expectations.mjs](../scripts/sync-launcher-evidence-expectations.mjs#L1)
rewrites frozen validator tables from generated artifacts; its instructions
then require generation again to incorporate the edited validator hash.
Separately, the inventory found 26 benchmark/compliance documents referencing
`PROTOTYPE_SUCCESS_CRITERIA.md` and 14 referencing `DECISIONS.md` as sources.
Editing an umbrella document can invalidate unrelated frozen plans.

Separate stable behavioral thresholds from recorded observations and snapshot
baselines. Make refresh an explicit, deterministic workflow whose outputs are
reviewable without rewriting validation logic from those same outputs. Bind
historical plans to the reviewed version of their actual inputs instead of
mutable umbrella logs. Preserve provenance and stale-evidence detection; never
turn this into blanket re-signing or automatic acceptance of changed evidence.

### R11 · P2 · The active visual design and the old contract conflict

**Source- and UI-confirmed.**
[VISUAL_TOKEN_SYSTEM.md](VISUAL_TOKEN_SYSTEM.md#L28) calls OCR-A the shell type
and lists panel `#101315`, paper `#efeee6`, and muted `#778084`.
[styles.css](../apps/console-lab/src/styles.css#L36) uses different colors and
Inter for general UI text. [UI_OVERHAUL_DESIGN.md](UI_OVERHAUL_DESIGN.md) describes
the new two-font system while preserving the old token name as a compatibility
surface. The old document does not clearly identify that supersession.
The home screen also hard-codes “Good evening” at 11 AM, duplicating the profile
name despite the strict useful-copy rule in `CLAUDE.md`.

Make one current design reference authoritative and identify historical rules
and compatibility aliases. Derive or verify shared token values without two
competing specifications. Remove nonfunctional greeting/filler and obsolete
copy; retain the current brand and meaningful status rather than redesigning
the interface to match a new template.

### R12 · P2 · Frontend lifecycle and presentation are concentrated in large files

**Source-confirmed.** `main.ts` is approximately 1,988 lines of imperative DOM,
tracker/game/session state, overlays, and input routing; `Launcher.svelte` is
1,456 lines; `native-host-client.ts` is 1,414 lines; `styles.css` is 6,620 lines.
Both Svelte and imperative code own substantial navigation/lifecycle concerns.
The native client repeats bounded fetch/auth/error-handling paths for endpoints.

Extract coherent ownership boundaries: tracker/session lifecycle, game/lab
mounting, launcher navigation, host transport versus endpoint parsers, and
component styles versus shared tokens. Keep one owner for each subscription,
timer, input route, and resource lifetime. Avoid a wholesale rewrite, pointless
one-function wrappers, or arbitrary line-count targets. Keep endpoint-specific
timeouts and size limits, rendering performance, and controller focus behavior.

### R13 · P2 · Native import and persistence concerns need narrower modules

**Source-confirmed.** `retro_import.rs` is approximately 7,091 lines, with the
test module beginning at line 4,504. Its production portion combines signed
policy, session import, operator provisioning, library schemas, staging,
recovery, audit, validation, and filesystem publication. `main.rs` similarly
combines several command parsers and composition paths. File size here is not
merely inline tests. Several stores also repeat small filesystem primitives.

Split modules by those existing responsibilities while preserving the public
API and on-disk formats. Extract only identical low-level primitives whose
contracts match; keep authority, journal ordering, rollback, and platform
durability decisions within their owning stores. Existing signature,
duplicate-field, symlink, crash-recovery, and replay tests must remain effective.
Do not replace the stores with a generic persistence framework.

### R14 · P2 · Bootstrap version checks contradict the declared Node minimum

**Source-confirmed.** The root manifest and development guide require
Node ≥22.12.0. [Pi bootstrap](../scripts/pi/bootstrap.sh#L61),
[appliance installation](../scripts/pi/install-appliance.sh#L374), and
[Windows bootstrap](../scripts/windows/bootstrap.ps1#L34) check only major ≥22.
They accept 22.0–22.11 and proceed beyond prerequisite validation.

Use one exact prerequisite policy based on the declared engine constraint,
with aligned error messages. Verify the boundary versions and pinned Pi setup
runtime. Keep dependency installs frozen and ordinary Cargo verification locked.

### R15 · P2 · Asset downloads lose their timeout before reading the body

**Source-confirmed.** In
[prepare-assets.mjs](../scripts/prepare-assets.mjs#L50), `clearTimeout` runs when
`fetch()` returns headers. `response.arrayBuffer()` runs afterward without that
timeout and buffers the entire response before checking the expected size.
A stalled or oversized response can hang/exhaust preparation despite the pins.

Keep cancellation active through body consumption; bound streamed bytes by the
declared asset size and publish verified bytes atomically. Test stalled bodies,
oversize bodies, digest mismatch, and a valid cached download without external
network timing. Preserve all exact model/font hashes and provenance.

### R16 · P2 · The Python experiment installs competing OpenCV distributions

**Manifest-confirmed.**
[pyproject.toml](../experiments/rtmo/pyproject.toml#L8) and its lockfile include
both `opencv-python` and `opencv-contrib-python`. Their upstream packaging
guidance says to choose one because they share `cv2`:
[OpenCV package documentation](https://pypi.org/project/opencv-python/#installation-and-usage).
Passing three helper tests does not establish a clean inference installation.

Inspect both direct and transitive requirements. Select one compatible
distribution per environment, or separate the MediaPipe and RTMO environments
when upstream requirements conflict. Preserve exact versions where possible,
regenerate frozen locks deliberately, and verify imported distribution ownership
plus the affected adapter/benchmark smoke paths. Do not silently suppress
dependency requirements or claim hardware/inference qualification from helpers.

### R17 · P2 · Documentation has no concise current architecture and status index

**Inventory- and source-confirmed.** A flat 387-document directory mixes current
contracts, superseded designs, owner-question documents, dated campaigns, and
an approximately 7,444-line implementation log. `README`, `RESEARCH`, decisions,
investigations, and open questions each describe overlapping status. The stale
visual and compliance descriptions above are concrete consequences.

Make onboarding point to a small current architecture/capability/development
set. Consolidate duplicate current explanations and place historical research
behind an archive index or move only a reviewed subset when references can be
updated safely. Preserve rights records, decisions, benchmark inputs, and their
provenance. Keep unfinished hardware questions explicit. Do not generate a new
document per refactor or delete history simply to lower file counts.

### R18 · P3 · A root scratch dump is tracked without any consumer

**Reference-scan confirmed.** The baseline root `a.txt` contains 7,523 bytes of copied
launcher-search expectation data. No other tracked text file references it;
the maintained expectations live in the actual validators.

Remove it after rechecking references at execution time. Check for other exact
scratch/duplicate candidates, but do not delete ignored local builds, caches,
models, fixtures, or historical evidence merely because they are large.

## Things to retain

- Rust as the privileged boundary; signed package/root/catalog policies and
  browser capability-token checks are useful architecture, not redundant slop.
- Separate public catalog and installed-manifest contracts. They represent
  different trust/readiness states; retain their discriminators and agreement
  tests rather than forcing one schema onto both.
- Versioned Motion API, simulator, replay, and backend-independent game inputs.
  Benchmark-only exports can move to explicit subpaths during R12, but runtime
  compatibility must be maintained deliberately.
- Bounds, strict parsing, privacy canaries, filesystem containment, durable
  replay/recovery tests, and the real Linux/Windows CI matrix.
- Exact upstream asset pins and rights records. Unqualified hardware and
  unresolved licensing must remain unqualified/unresolved.

## Execution record

Software cleanup completed on branch `cleanup/lean-project`. The findings above
describe the original baseline; the outcomes below describe the implemented work.

| Finding | Status | Outcome / verification |
| --- | --- | --- |
| R01 | Resolved | Camera startup owns cancellation across backend, permission and playback awaits; late streams and stale callbacks are closed. Nine regression tests, integration journeys and refreshed browser evidence pass. |
| R02 | Resolved | Corrected responsive specificity and tab shrinking. Rendered-text bounds now cover 720p, 1080p, 4K and narrow setup navigation. All 40 TV browser tests pass; inspected fresh 720p and 4K captures and registered current evidence. |
| R03 | Resolved | One bounded, serial Bluetooth worker keeps status and cancellation responsive while preserving mutation order. Real loopback scan/pair and shutdown regressions pass on Windows and Linux; locked Clippy passes on both. |
| R04 | Resolved | Refreshed the 148-component SBOM/notices and exact Inter font/license provenance. Deterministic compliance check is in CI and passes, including direct invocation on Windows. Project-license and pose-model redistribution blockers remain explicit. |
| R05 | Resolved | Recursive test discovery runs 64 runtime and 1,308 evidence tests, plus 831 workspace tests: all 2,203 pass. The Linux-owned Pi suite passes all 16 tests. Added Linux/Windows Python and Godot CI jobs; fresh local Godot import, four contracts and scene boot, and both frozen Python environments' imports and three helper tests pass. |
| R06 | Resolved | Strict scripts TypeScript includes the tools/tests with declared Node/WebSocket types; actual diagnostics were fixed. Full typecheck passes with zero errors or warnings. |
| R07 | Resolved | Explicit lab build retains rehearsals and test hooks. The appliance omits synthetic administration, fake update/storage controls, developer navigation and fixture documents, selects authenticated host-owned profile IDs, and preserves Guest built-in games. Three appliance browser tests cover capability boundaries, long IDs at 720p and both game flows. |
| R08 | Resolved | A bounded Node-core loopback server serves the built files with the required browser policy. Its compiled package needs no runtime TypeScript or writable dependencies. HTTP, containment and independent policy tests pass; Pi services use the built entrypoint, and Linux rendering/ShellCheck pass. |
| R09 | Resolved | Consolidated 179 repeated primitives across 97 validators. Ordered keys, unordered key sets and the distinct DIY binding order remain explicit; malformed UTF-8, bare CR, unsafe paths and stale hashes remain rejected. The complete evidence suite passes. |
| R10 | Resolved | Recorded measurements live in a data baseline; registration cannot rewrite acceptance rules and rolls back on failure. All five browser validators pass after actual captures. Frozen historical reports bind to verified archived source bytes; deterministic rehearsals reproduced identical authored outcomes. Removed three redundant umbrella-document bindings, reviewed changed dependencies and re-registered 555 current bindings across 59 plans. |
| R11 | Resolved | The v2 UI design is the current authority, legacy token guidance is reconciled, and Home now says Games. Profile/time remain in the top bar. Fresh screenshots and all browser tests pass. |
| R12 | Resolved | Separated application entry, run lifetime, motion markup, top-bar navigation/clock, host transport/protocol/endpoints and ten ordered style modules. Teardown releases listeners, timers, rendering, camera and launch ownership. Unit/type/browser checks pass. Appliance JavaScript output is 10.8% smaller than the original build; details below. |
| R13 | Resolved | CLI commands and native import formats, validation, filesystem publication, provisioning and recovery have distinct modules. Durable formats and public behavior are preserved. Locked Clippy and workspace tests pass on Windows and Linux. |
| R14 | Resolved | Pi and Windows wrappers use one prerequisite checker reading package.json engines. Version-boundary tests, the Windows wrapper, Linux script rendering and ShellCheck pass. The TV session receives the configured Node directory in PATH. |
| R15 | Resolved | Downloads retain cancellation through bounded streamed bodies and atomically publish only verified bytes. All six failure/cache/publication regressions and pinned-asset preparation pass. |
| R16 | Resolved | Mutually exclusive frozen backend environments have one OpenCV provider. The exact RTMLib redundant-provider metadata correction is documented without changing the upstream wheel. Both environments pass ownership/import checks, three helper tests and four-frame real-model smoke runs. Historical performance measurements retain their original source edition. |
| R17 | Resolved | A concise documentation index identifies current development, architecture and capability contracts and distinguishes historical plans/observations. Development documents appliance/lab commands, verification and deliberate evidence refresh. Existing research, rights records and links are preserved; changed Markdown local-file links validate. |
| R18 | Resolved | Removed the unconsumed 7,523-byte root scratch dump after checking references. No user data, benchmark records or useful fixtures were deleted. |

PR review follow-up tightened staged-file identity across hash/scan/publication,
bounded recovery-state reads, provisioning replay bindings, and process-unique
test fixtures. It also covered missing host profiles, failed page teardown,
tracking-loss timer cancellation, narrow profile layout, error-response headers,
generator cleanup, and the remaining bespoke microphone source-binding loop.
Current browser captures now use `installed-chrome` filenames with their exact
observed version and date in JSON. Forty fresh screenshots matched the inspected
pixels, all five independent browser-evidence validators passed, and archived
measurement bytes were preserved. New regressions cover the recovery file swap
on Linux, write/delete denial on Windows, appliance profile intent, and teardown.

### Verification and remaining limits

- Frozen install, full strict typecheck, 2,203 JavaScript/TypeScript tests, 93 lab
  browser tests and three appliance browser tests pass.
- Windows native tests: 447 library, 30 host CLI and 12 provisioner tests pass.
  Linux/WSL: 456 library, 30 host CLI, 12 provisioner and one cursor test pass.
  Both retain five intentionally ignored subprocess helper tests; child-helper
  invocations are not double-counted. Locked Clippy passes on both platforms.
- All 16 Linux appliance tests and ShellCheck at style severity pass. Windows
  Bash syntax checks also pass. Git diff whitespace and changed Markdown local
  links are clean. Remote CI and aarch64 linking were not run in this session.
- Fresh authoring, launcher Home, representative surfaces, Search and font
  captures pass the five independent validators. The recorded dates and tool
  versions are actual observations. Screenshots at 720p, 1080p and 4K were
  inspected, including the appliance's long opaque profile ID at 720p.
- Schemas, manifests, motion benchmarks, deterministic compliance and all 555
  plan-source bindings validate. Godot and Python results are software smoke
  evidence, not target-device, performance or physical-controller qualification.
- Windows Application Control blocks `cargo fmt` (error 4551). No policy was
  changed and no alternate execution path was used for the blocked formatter.
  Formatting verification remains an explicit tool-policy limit.
- Physical TVs/cameras/controllers, Raspberry Pi/Hailo qualification and
  unresolved project/model redistribution decisions remain outside this cleanup.

### Build comparison

Both builds used the same installed Node/pnpm/Vite toolchain. The original
revision was built in a clean detached worktree using its frozen offline lock;
the temporary worktree was removed afterward. These are emitted minified asset
bytes, not a performance or load-time claim.

| Output | Original default | Current appliance | Current lab |
| --- | ---: | ---: | ---: |
| JavaScript bytes | 931,687 | 831,484 | 933,882 |
| JavaScript files | 15 | 2 | 15 |
| CSS bytes | 112,043 | 112,374 | 112,374 |

The appliance removes 100,203 JavaScript bytes and 13 fixture scripts. The
largest appliance chunk remains 576,635 bytes; Vite's 500 kB advisory is still
visible. CSS grows by 331 bytes for the verified layout/containment fixes.
No artificial bundle threshold was raised to hide that advisory.

The initial local closeout covered 256 tracked changes and 61 new files on
`cleanup/lean-project`. Its path/status inventory, verification logs and fresh
screenshots are under the ignored `artifacts/cleanup-review/` directory.
Pull-request review and remote CI follow this local verification record. The reusable task prompt remains
[CLEANUP_PROMPT.md](CLEANUP_PROMPT.md).
