# VCG Console security threat model

Last updated: 2026-07-24

## Overview

VCG Console is an offline-first living-room game-console project. Its present desk prototype combines a trusted Svelte launcher, local camera and pose inference, a capability-filtered Motion web bridge, and a Rust host that can supervise processes and resolve a signed installed Libretro package from narrow browser intent. Hosted third-party games, local packages, future developer deployment, retro imports, profiles, saves, updates, and two target Linux appliance tiers have different trust and availability requirements.

This model is repository-scoped. It identifies vulnerability classes and security invariants for current and planned product surfaces; it is not a list of confirmed findings. Hardware qualification, legal review, and unavailable services remain explicit evidence gaps rather than assumed controls.

Primary assets are:

- control of native execution, system startup, recovery, and the reserved Home/Back path;
- installed-catalog signing roots, package identity, artifact integrity, anti-rollback state, and trusted release metadata;
- raw camera pixels, derived skeletons/actions, future calibration/body-matching data, profile portraits, saves, and household-local records;
- the trusted launcher origin, ephemeral loopback bearer capability, Motion capability grants, and lifecycle records;
- isolated writable roots for profiles, saves, runtime state, logs, retro content, and staged updates;
- availability of the launcher, tracker, controller recovery, game watchdog, and a bootable previous system/package state; and
- the honesty of readiness, offline, qualification, rights, permission, and failure disclosures.

The highest-level security objectives are to keep games from becoming console authority, keep camera and household data within their declared local boundary, execute only reviewed and integrity-bound native artifacts, preserve an unstealable recovery path, and fail closed without converting outages or incomplete qualification into false success.

## Threat Model, Trust Boundaries, and Assumptions

### Actors and capabilities

- A normal household player is physically present but not authenticated as an administrator. Children, guests, siblings, and accidental inputs are expected. Credential-free local management means physical presence is not proof of profile ownership.
- A hostile or compromised hosted game controls its page, scripts, network responses, redirects, storage, focus, pointer lock, full-screen requests, and messages sent from its origin. Approval of one origin does not make every future deployment at that origin trustworthy.
- Another local web page or unprivileged local process can probe loopback ports and try to send messages or HTTP requests. It does not initially know a fresh 256-bit bearer capability.
- A malicious package publisher, compromised build/update service, or attacker controlling package files can supply manifests, catalogs, binaries, configurations, symlinks, archives, emulator content, or downgrade candidates. Possession of an authorized signing key materially changes this attacker's power.
- Imported retro content is untrusted complex input even when the user is entitled to possess it. Emulator and core parsers are part of its attack surface.
- A paired developer workstation and its keys are privileged only during the explicitly enabled developer workflow. That workflow is planned and must not be inferred from ordinary LAN reachability.
- A local operating-system administrator, root process, kernel compromise, or attacker with unrestricted write access to trusted keys and the running host can defeat most application controls. Protecting against that actor depends on the planned read-only image, key provisioning, sandbox, service manager, and physical/storage controls.
- Dependency, model, browser, Rust crate, npm, compiler, and build-pipeline compromise is a supply-chain actor. Reproducible release and SBOM controls are planned, not yet complete.

### Trust boundaries

1. **Room and sensor to tracker.** The physical scene and camera driver supply attacker-influenceable frames and timestamps to browser capture. [`tracker.ts`](../apps/console-lab/src/tracker.ts) requests video with `audio: false`, transfers at most one in-flight `ImageBitmap`, and stops tracks on exit or fault. [`tracker-worker.ts`](../apps/console-lab/src/tracker-worker.ts) performs local inference and closes every accepted image. The browser/OS/GPU implementation remains beneath this boundary.
2. **Tracker to derived Motion data.** Raw pixels become landmarks, actions, timestamps, and bounded skeleton traces. [`trace-buffer.ts`](../apps/console-lab/src/trace-buffer.ts) exports only strict v2 traces marked `containsRawFrames: false`, with at most 600 portable core17 x/y frames, 128 stable health events, four concurrent players, 64 trace-local track pseudonyms, exact content provenance, and a 4 MiB runtime bound. It strips rich/world/presence fields, clears its pseudonym map with the volatile epoch, counts evictions, and flags/skips unrepresentable player or track frames instead of disrupting the shell. A derived skeleton is still sensitive behavioral/body data and is not public merely because it is not a photograph.
3. **Trusted Motion host to a game origin.** [`MotionBridgeHost`](../packages/motion-web-bridge/src/host.ts) accepts exact allowlisted origins, requires bridge v2 and exact Motion API `0.4.0` binding before session creation, intersects tracker capabilities with an explicit host permission grant, validates protocol messages, sends only closed-vocabulary health without provider exception text, binds frame source/status to current ordered health, negotiates required/optional profiles inside the grant, projects each frame to granted capabilities, rate-limits delivery, waits for acknowledgements, and expires stalled sessions. The source window and origin jointly identify a session. Unknown fields remain non-authoritative and forward-compatible; origin admission, game review, navigation containment, and signed package authority remain separate controls.
4. **Hosted page to console shell and compositor.** A hosted game becomes a supervised top-level page by design. The game must never own reserved Home/Back, process termination, or recovery. The current browser supervisor explicitly says it cannot enforce post-navigation containment, and compositor-level global controls are not implemented or qualified. This is a blocking boundary, not an assumed mitigation.
5. **Trusted launcher to Rust loopback host.** [`host_api.rs`](../native/vcg-host/src/host_api.rs) binds IPv4 loopback, requires an exact configured origin and per-launch random bearer, uses bounded request/body sizes and I/O timeouts, rejects ambiguous framing, and exposes only declared routes. The capability travels in the URL fragment so it is not sent to the launcher HTTP server or as a referrer. XSS or unintended navigation in the trusted launcher origin could still expose in-memory authority.
6. **Browser launch intent to native authority.** The browser submits only protocol version, request ID, game ID, and profile ID. [`native_launch.rs`](../native/vcg-host/src/native_launch.rs) allowlists profiles, limits active and retained records, rejects conflicting replay, and resolves execution through the host-owned signed catalog. Browser-supplied paths, hashes, programs, commands, environments, adapters, and writable roots are not authority.
7. **Signed metadata to installed artifacts.** [`installed_catalog.rs`](../native/vcg-host/src/installed_catalog.rs) verifies a bounded detached Ed25519 signature before parsing, requires an exact target and qualified entries, validates canonical relative paths, binds manifest/artifact hashes, and resolves files beneath canonical host-owned roots. Key immutability, rotation/revocation, delegated signing, persisted generation rollback protection, and atomic installation are not implemented.
8. **Rust host to child game.** [`process.rs`](../native/vcg-host/src/process.rs), [`retroarch.rs`](../native/vcg-host/src/retroarch.rs), [`native_package.rs`](../native/vcg-host/src/native_package.rs), and the native launch coordinator start direct children without a shell, verify catalog-selected artifacts, isolate supplied per-profile paths, observe exit, and terminate/reap owned direct children. Native packages cannot select arguments, environment names, working directories, or writable roots, but the process still inherits the service environment and can reach ambient filesystem/network/devices without a target sandbox. Host-selected installed games may require bounded heartbeat/process-exit recovery inside the same idempotent request, including cancellation during an attempt or restart backoff. The connected API path deliberately has no resource-fault file yet. Immutable hash-to-spawn handoff, descendant process groups, sandboxing, compositor association, window readiness, protected probe producers, and hostile-child cancellation are not proven.
9. **Writable device state to maintenance and recovery.** The logical storage plan separates firmware, equal read-only A/B system slots, and writable data; writable data has nine fixed host-derived namespaces and recovery headroom outside ordinary admission. Cleanup authority is class-specific: metadata/profiles/saves are never automatic, packages/developer/retro require their lifecycle coordinators, logs/cache require bounded policy, and staging requires transaction recovery. Package-transfer and generation cleanup are explicitly locked and crash-recoverable. Factory-reset disposition deliberately remains unresolved for production packages and retro content. The plan changes no disk, reserves no blocks, and does not prove mount or physical fault isolation.
10. **Developer/build inputs to release artifacts.** Manifests, generated schemas, pinned dependencies, assets, scripts, and future signing tools cross from developer control into release authority. Current schema freshness, exact toolchain pins, manifest validation, and signed-catalog tests reduce accidental drift; reproducible images, protected signing, provenance, SBOM, and release separation remain open.
11. **Public catalog metadata to launcher presentation.** Every public manifest is reconciled with one strict host-owned launcher policy before a deterministic browser artifact is generated. Exact membership, explicit hidden state, destination/budget bounds, runtime/surface agreement, and freshness checks prevent silent Svelte copies or accidental exposure. An independently bounded, canonical, path-free view of the signature-verified installed catalog may add an `Installed` label only after exact ID/version/runtime matching. Unknown installed entries stay hidden, and neither browser artifact can install, approve, or execute a package, create a native profile, or replace host-owned per-launch resolution.
12. **Ordinary runtime to power and boot maintenance.** The power-policy prototype closes launch admission before accepting exact service quiescence, binds acknowledgements and handoff to one bounded operation, and treats timeout, adapter failure, and electrical interruption as failure rather than success. Service and recovery authority belongs to a separate cold-boot physical-control path: an initial qualified hold/release authorizes only service mode, while destructive recovery requires a fresh physical press/release and one-shot consumption. The TypeScript model cannot authenticate hardware evidence or execute power/recovery; production must keep those calls behind the native boot coordinator and unavailable to browser, game, Motion, controller, LAN, and ordinary runtime authority.
13. **External recovery release to replacement media.** [`recovery_image.rs`](../native/vcg-host/src/recovery_image.rs) verifies exact bounded manifest bytes under a separate delegated recovery-image role before parsing, binds target and compatible hardware, completely hashes the archive through a retained handle, and can seal exact expanded-image read-back evidence. It does not download, decode, enumerate or select devices, write or synchronize blocks, prove that a read-back stream came from the selected removable medium, grant destructive authority, or prove device-only data exclusion. A production writer must keep those privileges outside the launcher and games, preserve the boot-only physical ceremony, and fail closed before any write when identity or provenance is ambiguous.

### Repository-wide invariants

- Normal tracking neither stores nor transmits raw frames, and microphone capture remains disabled by default.
- A game receives only the derived Motion profiles explicitly granted to its exact reviewed origin/session; it never receives raw camera authority through an unknown manifest extension.
- Hosted or local game code cannot capture or suppress the system's reserved recovery action.
- Native controller observations are bounded and transactionally validated; ambiguous mappings cannot emit semantic actions, disconnect synthesizes releases, and only opaque session-local controller IDs cross into shell events.
- Web content cannot choose a native executable, filesystem path, hash, command, environment, writable root, qualification state, or signing identity.
- Installed native execution requires valid, non-rolled-back, target-correct signed metadata and artifacts whose bytes still match their bound hashes at use time.
- Paths derived from packages or imports remain beneath the intended canonical root despite traversal, symlink, archive, Unicode, case, or platform edge cases.
- Child processes and descendants cannot outlive ownership, evade cancellation, impersonate readiness, or inherit more device/filesystem/network authority than declared.
- Offline-required features do not gain undeclared WAN dependencies or leak data when the network becomes available.
- Profile deletion, factory reset, uninstall, rollback, update, diagnostics, and import cleanup affect only their documented scope and do not silently reassociate sensitive identity.
- Accessibility preferences are bounded non-sensitive presentation/input hints; they cannot grant privilege, select identity, enable device/game permissions, or remap reserved recovery actions.
- Browser, game, Motion, controller, remote, and ordinary runtime input cannot acknowledge power quiescence, start an OS handoff, or mint boot-service/recovery evidence; emergency electrical power loss is never represented as safe shutdown.
- Ordinary writes cannot consume declared recovery headroom; only an explicit privileged recovery-workspace operation may use it, and admission alone is not a physical reservation.
- Protocols, parsers, queues, traces, logs, lifecycle histories, retries, and health checks are bounded and fail closed under malformed or stalled input.
- Compatibility, rights, permission, health, and readiness states are truthful. A valid public manifest or started process is not represented as installed, qualified, visible, responsive, or safe.

### Assumptions and explicit exclusions

- The current desk prototype runs on a development workstation and is not target-Linux qualification.
- Browser, OS, compositor, GPU, camera-driver, kernel, firmware, and hardware-root vulnerabilities are considered dependency/platform risks; this repository is responsible for safe configuration, pinning, update response, and containment but cannot repair those components here.
- Physical destruction, invasive hardware extraction, and an already-unrestricted root attacker are outside application-level prevention. Recovery, encryption, read-only roots, and key separation should still reduce persistence and data exposure.
- Casual household leaderboards are explicitly unverified. Ordinary cheating without crossing a privilege, privacy, integrity, or availability boundary is not a security vulnerability.
- Future installer, update, import, persistent profile/save, paired developer,
  and service-manager code remains in scope for design threats that cannot
  become present implementation vulnerabilities before the code exists. A
  portrait and credential-free profile-management lifecycle models and UIs
  now exist, and a camera-free calibration confidence/guidance controller adds
  ordered synthetic observation and invalidation state. Their
  state/input/claim boundaries are present attack surface. The implementation
  is restricted to opaque synthetic handles, closed session-only
  profile/progress/confidence fixtures, and invokes no camera, pixel,
  landmark, measurement, floor transform, room map, registry, vault, save
  broker, hosted service, or durable store. Real portrait capture/storage,
  calibration measurement/persistence, and native profile mutation remain
  future attack surface.
- Denial of one voluntarily launched untrusted game is less severe than denial of boot, Home/Back, tracker recovery, update rollback, or the whole console.

## Attack Surface, Mitigations, and Attacker Stories

### Camera, tracking, Motion data, and profiles

Relevant classes include unintended capture, raw-frame retention or egress, microphone activation, worker-message confusion, stale-run frame acceptance, unbounded traces, capability overgrant, skeleton re-identification, adversarial poses, false privileged actions, profile misidentification, portrait leakage, and diagnostic/crash-dump exposure.

Present controls include `audio: false`, no rendered tracking-camera pixels,
one-frame backpressure, run IDs, local worker inference with main-thread
fallback disclosed, image closure, schema validation, bounded core17-only v2
traces with trace-local IDs and stable health reasons, a closed
game-permission vocabulary, explicit host profile grants
before Motion negotiation, per-profile frame projection, acknowledgement
backpressure, and session expiry. The synthetic portrait rehearsal additionally
requires exact notice/countdown/session/attempt/preview acceptance, rejects
stale callbacks, and invokes no `getUserMedia` in its simulator-backed Chrome
flow. The credential-free management rehearsal requires one exact opaque
profile, closed revision-bound scope, initially safe focus, a 1.5-second
review, 30-second expiry, and stale portrait/calibration/body/progress
rejection. Reset and delete revoke the shared synthetic portrait; deletion
unassigns local progress and same-name recreation receives no links. The
browser test suite observes no external requests or persistent browser stores
during normal camera mode.

The calibration rehearsal binds every observation to an exact
session/attempt/profile/environment/camera reference, requires contiguous
bounded samples, blocks any unsafe-zone/camera-movement/no-player/multi-player
fact, refuses stale corrections, permits only optional neutral/range
conservative fallback, expires abandoned sessions, and invalidates Ready after
explicit changed room/camera evidence. Its snapshots and results contain no
body measurements or storage authority. These controls prevent the synthetic
UI from silently guessing missing dimensions; they do not qualify real
confidence, room-change detection, floor geometry, safety, persistence, or
game delivery.

Important attacker stories are a hostile game requesting richer landmarks than approved; a same-origin compromise inheriting an origin allowlist; a crafted scene causing false join/Back/pause; a stale worker result crossing camera restart; or future support/log tooling accidentally including frames, portraits, body measurements, or linkable traces. Required follow-up includes OS/device permission tests, crash/swap inspection, legal/privacy review for body matching and portraits, sensitive-store encryption and deletion, adversarial action scoring, and negative export/support-bundle tests.

### Browser games, navigation, and Motion bridge

Relevant classes include XSS in the trusted shell, compromised approved origins, `postMessage` origin/source confusion, capability escalation, replay/session fixation, navigation to an unapproved origin, pop-up/download/protocol-handler escape, pointer-lock/full-screen capture, browser permission prompts, cookie/storage cross-contamination, and denial through message or frame floods.

Exact origin/source checks, schema/version validation, requested-capability negotiation, data projection, per-session IDs, ACK gating, rate limits, and expiry materially constrain the cooperative bridge. Vite development/preview now gives every launcher HTML navigation a response-level deny-by-default CSP, Permissions Policy, no-referrer/MIME protections, and cross-origin isolation; route-specific policies preserve only exact cooperative fixture relationships. A real Chrome hostile cross-origin iframe proves sensitive capability, parent-DOM, network, form, popup, download, top-navigation, and fullscreen attempts are denied even after granting site-level camera, microphone, and location permission. These are desk-lab iframe controls, not production-server or top-level-game containment. The hosted supervisor validates the initial and redirected health-check origin and uses a private browser profile, but it does not yet contain navigation after launch.

[`MOTION_SECURITY_REVIEW.md`](MOTION_SECURITY_REVIEW.md) supplies the current Motion-specific data-flow diagram, trust assumptions, security invariants, abuse matrix, test evidence, and residual-risk boundary. It also records the default-16/hard-64 distinct-session bound and proves that a correct-origin sibling window cannot spoof server health or terminate another source window by copying its session ID.

Remaining threat tests include hostile same-window and sibling-window messages, allowed-origin compromise, redirects after readiness, custom schemes, `file:` attempts, pointer lock, nested full-screen, focus theft, storage persistence, high-rate messages, hung renderers, production header parity, and reserved Home/Back during each state. Approval and emergency revocation must be version/origin scoped rather than a permanent endorsement.

### Loopback host and privileged launch IPC

Relevant classes include bearer discovery or leakage, DNS/origin confusion, CORS mistakes, CSRF-like requests, token comparison leaks, request smuggling, oversized/slow bodies, route confusion, JSON ambiguity, replay/conflict bugs, lifecycle enumeration, native-detail leakage, cancellation races, and denial of the single active launch slot.

Present controls include IPv4-only ephemeral binding, OS-random 256-bit bearer tokens, fragment delivery, exact loopback origin validation, constant-time token comparison, exact CORS preflight, `no-store`, short I/O deadlines, strict size limits, duplicate security-header and transfer-encoding rejection, closed JSON shapes, 128-bit request IDs, bounded lifecycle history, one active child, and non-sensitive response fields.

The realistic high-value story is script execution in the trusted launcher origin or unintended navigation that reads the fragment/in-memory token and then invokes authenticated launch operations. Another local origin without the token should not succeed. Durable replay now prevents request re-execution and fresh launch after ambiguous restart, but same-account journal tampering, escaped descendants, and false cleanup acknowledgement remain high-value native threats. Follow-up should test browser history, crash reports, screenshots, extension policy, referrers, logs, speculative requests, hostile local listeners, port reuse, slowloris concurrency, journal permissions/tamper/sudden power, service-manager cleanup proof, and token destruction when the browser or host exits.

### Signed catalog, packages, updates, and rollback

Relevant classes include signing-key theft, signature bypass, parse-before-verify, canonicalization disagreement, target confusion, duplicate IDs, manifest misbinding, hash substitution, symlink/time-of-check races, downgrade and freeze attacks, partial installation, low-space corruption, rollback to incompatible data, key-revocation failure, and mixing developer artifacts with production.

Current catalog code verifies signatures before parsing, uses a domain-separated signed message, accepts canonical key/signature encodings, rejects unknown fields and wrong targets, validates bounded IDs/versions/records, contains canonical files beneath host roots, binds manifest identity, and re-hashes launch artifacts. Tests cover tamper, path escape, misbinding, target, duplicate, size, and post-load artifact change cases.

The Rust library now binds a resumable exact-offset transfer to signed archive evidence, derives progress from synchronized bytes, rejects gaps/conflicting replay, rechecks remaining-byte headroom, and publishes only a fully hashed no-replace ready archive whose immutable release binding is retained. The generation-store handoff keeps the receiver lock, independently verifies the descriptor with the store's delegated update policy, requires the same binding, and re-hashes the ready archive. Intake binds exact archive/expanded/catalog evidence, rejects unsafe TAR paths/types/collisions/modes, extracts into private no-replace work, fully verifies artifacts, and publishes only inert staging while retaining the ready receipt. Candidate health, move-time reverification, append-only activation, launcher recovery, and cleanup planning remain fail-closed. Exact externally supplied channel/target/generation/catalog-digest state now blocks launch, generation cleanup, candidate execution, and later promotion when writable activation history is pending, deleted, or substituted; pending state is returned only after signed release re-verification and is never committed by launcher startup. Cooperating store mutations use one nonblocking inert lock; explicit generation cleanup first freezes launch admission, derives path-free protection, then holds the store lock through a bounded synchronized intent, marker-first deletion, and completion. Restart recovery reacquires both leases and refuses newly protected or changed targets. Browser/package callers cannot supply protection or deletion paths, and no browser endpoint or automatic scheduler invokes cleanup.

Update-role authority now starts with bounded root bytes signed by an out-of-band anchor threshold. Parsing follows that threshold check. Rotation advances exactly one generation and requires both current and candidate root thresholds; expiration uses caller-supplied trusted time; root and delegated public keys cannot be reused; and roles bind one exact channel, artifact family, and target under fixed cross-protocol domains. Omission from the next authenticated root revokes a delegated key. The public system-image, recovery-image, installed-catalog, and package-release paths require this role authority before parsing; the generation store reuses one policy through staging, promotion/recovery, and launcher reload. Serialized anchor and signature documents are closed and bounded.

The accepted-root store can now retain exact root/signature bytes in a bounded
append-only generation chain. It synchronizes a private incoming directory
before atomic rename, treats that rename as the commit point, replays every
threshold link, binds the final root to an exact caller-supplied protected
generation and metadata digest, and removes only validated unpublished
directories during explicit recovery. New roots cannot authorize artifacts
until that exact state is committed. Unexpected entries, gaps, changed bytes,
same-generation substitution, pending commits, expired current roots, and lock
contention fail closed. Normal launcher startup recovers unpublished
directories and replays the store before package or browser startup; dry-run
does not mutate it. Writable history is crash-monotonic evidence, not
tamper-resistant state:
qualified protected-state storage, secure time, production threshold/custody,
repository timestamp/snapshot metadata, target power-loss qualification, and
recovery ceremonies do not exist.

The system-image manifest then binds a safe release ID, exact privileged target, generation, raw file length, and SHA-256 through closed JSON. The complete bounded regular file is opened once, length-checked before/after streaming, hashed, retained, and rewound for a future privileged writer. Changed/truncated images, wrong target/role/signature/schema/format, unknown fields, unsafe identifiers, and oversized inputs fail. Source verification creates no slot/journal evidence; only a complete matching read-back can create sealed evidence for a host-selected inactive slot. Retaining the handle prevents path replacement from redirecting the copy but does not stop concurrent in-place writes; writer-side reverify and synchronized inactive-partition read-back remain mandatory. This does not write a partition, choose which slot is inactive, or verify firmware.

Whole-card recovery uses a separate `recovery-image` artifact and signature
domain rather than inheriting system-image authority. Its strict manifest binds
the exact target, sorted compatible hardware IDs, generation, release ID,
archive encoding/length/hash, expanded raw-image length/hash, and minimum media
size. The verifier completely hashes an absolute regular archive, retains its
opened handle across path replacement, and can issue non-deserializable
read-back evidence only after the signed expanded prefix matches. Raw archive
and expanded identities must be identical; ZIP remains an opaque verified
archive until a reviewed bounded single-image decoder exists. This primitive
does not prove download provenance beyond signatures, device selection,
write/synchronization, removable-reader provenance, boot success, destructive
consent, or absence of household data.

System-image state has a separate hash-linked, consecutive, append-only two-slot
journal. It accepts only delegated-channel/exact-target strictly advancing
evidence for the inactive slot, keeps staged images out of boot selection,
consumes a bounded globally unique attempt before candidate transfer, isolates
health passes to one attempt, and records confirmation or automatic rollback
without any user-data or arbitrary-path field. Every read and transition now
requires an externally protected exact channel/target/latest-record identity;
every mutation publishes first and returns the next identity, and candidate
transfer requires the boot-claim identity to be committed first. Exact
operation retry can authenticate one record ahead without trusting unexplained
writable history. Temp publication before/after the no-replace final link
recovers deterministically; malformed, gapped, stale-attempt, rollback,
substitution, scope-drift, changed-history, and rehashed impossible-transition
cases fail closed. The JSON adapter is not itself protected, and this does not
drive Raspberry Pi firmware, supply qualified compare-and-swap storage,
authenticate health producers, or prove target filesystem power-loss behavior.

An explicit host-only save-reset primitive now consumes the bounded
`SaveStoragePlan` identity, publishes a strict path-free durable intent under a
nonblocking lock, and deletes only the exact canonical save/cache targets.
Interrupted deletion resumes idempotently; unpublished temporary state deletes
nothing; malformed state or target substitution fails closed. No browser/CLI
path invokes it, and its intent contains no payload, export, network,
profile-vault, portrait, or calibration authority. Runtime quiescence,
same-account hostile-writer/link-swap resistance, sandbox/mount enforcement,
confirmation UX, and target power-loss evidence remain unproven.

The trust chain is still incomplete: network discovery/TLS/range behavior does
not exist; root anchors, exact accepted-root/package/system-update state
provenance and compare-and-swap, and time are not protected;
timestamp/snapshot/mirror/freeze defenses are absent; capacity is checked
rather than reserved; compressed extraction does not exist; an ordinary child
can self-assert ready until producers are qualified; post-activation package
rollback, automatic retention, uninstall, and managed-content/save disposition
do not exist; hostile same-account writers, non-Unix durability, target
lock/bootloader behavior, and verification-to-use immutability are unproven.
Production still needs a qualified platform mechanism for protected
root/package monotonic state, secure continuously refreshed time, real storage
reservation, read-only mounts or descriptor execution, hostile
transfer/intake/health/cleanup/system-update tests, crash/power-loss campaigns,
and a separate developer namespace.

### Native child, watchdog, emulator, and imported content

Relevant classes include shell/argument injection, path escape, unsafe inherited environment or handles, malicious emulator/core/content parsing, writable configuration abuse, child escape, descendant survival, heartbeat spoofing, readiness spoofing, restart loops, save corruption, cross-profile data access, GPU/device overprivilege, and cancellation failure.

The host launches direct commands rather than shell text, verifies canonical paths and hashes, generates isolated runtime/config/save/state directories, has managed-child cleanup, and provides bounded watchdog policy with startup/heartbeat/fault states. API launches use startup/heartbeat/process-exit supervision only when privileged host configuration assigns the verified installed game to the watchdog set; the setting applies consistently across player profiles and other games stay process-only. Retries cannot create a second request record, and runtime heartbeat health never becomes window-readiness authority.

Accepted launch intent and every lifecycle transition now enter an exclusively locked bounded journal before execution or publication. Restart recovery never re-executes a nonterminal intent: it persists a terminal indeterminate disposition and a cleanup barrier that only trusted native code can acknowledge. Corrupt, duplicate, conflicting, oversized, or unavailable replay state fails closed. Remaining threats include same-account journal tampering or deletion, unqualified filesystem durability, journal lifetime across boot epochs, and a service manager falsely claiming that descendants are gone. Production must protect replay storage, own game cgroups, prove them empty before acknowledgement, and qualify restart and sudden-power behavior.

Retro content remains untrusted regardless of entitlement. Before import or family-mode launch, emulator/core processes need a target-specific least-privilege sandbox, read-only code/content, isolated writable saves, restricted devices/network, descendant process-group ownership, corrupt-content tests, and exact core/content rights. Heartbeats must be authenticated or host-owned enough that a compromised child cannot claim the intended visible window is healthy; compositor observation remains authoritative for visibility.

### Writable state, diagnostics, developer mode, and maintenance

Relevant classes include secret/PII logging, log injection or disk exhaustion, cross-game save access, quota bypass, profile deletion that leaves linkable remnants, unassigned-progress reassociation, insecure reset, malicious USB/LAN archives, paired-key theft, unattended developer listeners, unsigned-code confusion, update interruption, and recovery media that includes household data.

The browser launcher now models family, admin, and developer state separately
from guest/local profile identity. It defaults and explicitly locks to family,
requires two distinct expiring local confirmations before developer state,
cancels pending transitions through Back, visibly marks developer state, and
revokes elevation on identity change. It opens no listener and grants no native
authority; same-origin code can still synthesize browser events. Production
must authenticate administration and accept confirmation through privileged
reserved input before a paired-LAN service can use this state.

The browser also retains at most 256 closed diagnostic codes in memory. Codes
derive subsystem/severity and have no caller text or payload field. A frozen
at-most-64-KiB JSON export follows exact review, local admin gating, and
separate prepare/confirm actions; automated byte inspection excludes active
profile identity, URL secrets, frames, skeletons, credentials, personal
identifiers, and free text, and observes no export request. This constrains the
prototype but does not authenticate event truth or provide native persistence.

The credential-free profile-management prototype keeps display text separate
from opaque authority, permits duplicate names, and requires exact delayed
confirmation for recalibration, reset, and deletion. Its deletion result
removes the selected synthetic sensitive state and converts only exact linked
progress records to unassigned; hosted-service records remain visibly outside
VCG authority. Early motion Select activates the initially focused safe choice,
Back cancels the modal, changed state fails closed, and same-name recreation
does not reattach progress. These controls do not supply a native atomic
transaction, authorization, sanitization proof, crash recovery, forensic
deletion, or household-abuse acceptance. Production must bind registry, vault,
progress, and protected state under one qualified broker and fault-test every
commit boundary.

The repository now models one aligned firmware/equal A/B/writable-data layout, fixed direct-child data namespaces, aggregate capacity, recovery reserve, inactive verified-image fit, logical fault scope, and cleanup/reset disposition. It rejects relative/root/traversal-like roots and never treats automatic cleanup as authority over identity, saves, or installed content. Production brokers and physical enforcement remain absent. Safe implementation still requires real partition/mount identity, per-game identities and quotas, serialized block reservation, atomic writes, bounded/redacted logs, deliberate consented export, archive limits, staging recovery, no source-path retention, protected paired keys, visible developer state, factory-reset policy/verification, and tests proving profiles/portraits/body data never enter system slots, saves, diagnostics, recovery images, or cloud paths.

### Supply chain and developer tooling

Relevant classes include dependency compromise, malicious install scripts, generated-schema drift, model/asset substitution, compromised CI secrets, unsafe release automation, and signing production artifacts from an ordinary development environment.

The repository pins Node, pnpm, Rust, crates, JavaScript dependencies, local MediaPipe assets, and checked-in schemas; lockfile policy, generated-schema and launcher-catalog freshness, strict type/build/test gates, Rust formatting/Clippy, and catalog signature tests provide useful assurance. They do not replace provenance verification, dependency review, reproducible builds, artifact attestations, protected signing, SBOM/notices, secret isolation, or review of changes to workflow and release authority.

## Severity Calibration (Critical, High, Medium, Low)

### Critical

A critical issue enables broad persistent console compromise, bypasses the production trust root, or exposes the most sensitive household capture data at scale with little user interaction.

Examples include remote or package-controlled arbitrary code execution as the host/update service across production consoles; accepting an unsigned or wrong-target system/package release as trusted; compromise of an online key that can silently replace the OS or qualified packages without effective revocation; or normal camera operation streaming raw household video or microphone audio to an attacker-controlled service.

A similar bug is lower than critical when it requires existing root access, a deliberately enabled development session, a single manually installed unapproved build, or physical invasive access with no scalable path.

### High

A high issue crosses a major privilege, privacy, or recovery boundary on one console or one approved game path.

Examples include a hosted page stealing loopback launch authority and selecting arbitrary native execution; path/symlink confusion escaping a managed root; emulator content escaping its sandbox to access profiles or the network; bypassing global Home/Back so a malicious or hung game traps the appliance; exfiltrating portraits/body-matching data; or a rollback/power-loss flaw that predictably makes the console unbootable and defeats automatic recovery.

Severity rises toward critical when the same path is remotely reachable by default, affects every signed package or update, or compromises a reusable release key.

### Medium

A medium issue causes bounded local denial, leaks derived or non-secret household data, weakens isolation without native code execution, or requires meaningful local/preexisting access.

Examples include unauthenticated lifecycle metadata enumeration without token disclosure; a Motion capability/session bug that leaks skeleton fields to another already approved origin; an interrupted child that keeps fresh launch behind the durable cleanup barrier but cannot escape its future process group; cross-game save access limited to one local account; diagnostics containing stable identifiers or excessive skeleton traces; or a malformed manifest/IPC request causing a controlled host crash.

Severity rises when the data is linkable to children, the denial removes recovery/boot rather than one game, or a seemingly bounded issue composes with navigation or token leakage.

### Low

A low issue has minor confidentiality or robustness impact, needs narrow local timing/control, or affects only developer-facing tooling without entering release authority.

Examples include disclosure of already public package ID/version/target metadata; a local household user cancelling another user's current game in the credential-free model; unbounded cosmetic error text that does not reach logs or storage limits; or a dry-run/tooling failure that cannot change trusted artifacts.

Ordinary gameplay cheating, visual polish defects, inaccurate vendor capability claims caught before qualification, and crashes confined to an explicitly unapproved developer build are generally not security findings unless they cross a documented privilege, privacy, integrity, or appliance-availability boundary.
