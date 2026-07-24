# VCG Console security threat model

Last updated: 2026-07-23

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
2. **Tracker to derived Motion data.** Raw pixels become landmarks, actions, timestamps, and bounded skeleton traces. [`trace-buffer.ts`](../apps/console-lab/src/trace-buffer.ts) exports only schema-validated frames marked `containsRawFrames: false`. A derived skeleton is still sensitive behavioral/body data and is not public merely because it is not a photograph.
3. **Trusted Motion host to a game origin.** [`MotionBridgeHost`](../packages/motion-web-bridge/src/host.ts) accepts exact allowlisted origins, validates protocol messages, negotiates required/optional profiles, projects each frame to granted capabilities, rate-limits delivery, waits for acknowledgements, and expires stalled sessions. The source window and origin jointly identify a session. Origin admission, game review, navigation containment, and permission policy remain separate controls.
4. **Hosted page to console shell and compositor.** A hosted game becomes a supervised top-level page by design. The game must never own reserved Home/Back, process termination, or recovery. The current browser supervisor explicitly says it cannot enforce post-navigation containment, and compositor-level global controls are not implemented or qualified. This is a blocking boundary, not an assumed mitigation.
5. **Trusted launcher to Rust loopback host.** [`host_api.rs`](../native/vcg-host/src/host_api.rs) binds IPv4 loopback, requires an exact configured origin and per-launch random bearer, uses bounded request/body sizes and I/O timeouts, rejects ambiguous framing, and exposes only declared routes. The capability travels in the URL fragment so it is not sent to the launcher HTTP server or as a referrer. XSS or unintended navigation in the trusted launcher origin could still expose in-memory authority.
6. **Browser launch intent to native authority.** The browser submits only protocol version, request ID, game ID, and profile ID. [`native_launch.rs`](../native/vcg-host/src/native_launch.rs) allowlists profiles, limits active and retained records, rejects conflicting replay, and resolves execution through the host-owned signed catalog. Browser-supplied paths, hashes, programs, commands, environments, adapters, and writable roots are not authority.
7. **Signed metadata to installed artifacts.** [`installed_catalog.rs`](../native/vcg-host/src/installed_catalog.rs) verifies a bounded detached Ed25519 signature before parsing, requires an exact target and qualified entries, validates canonical relative paths, binds manifest/artifact hashes, and resolves files beneath canonical host-owned roots. Key immutability, rotation/revocation, delegated signing, persisted generation rollback protection, and atomic installation are not implemented.
8. **Rust host to child game.** [`process.rs`](../native/vcg-host/src/process.rs), [`retroarch.rs`](../native/vcg-host/src/retroarch.rs), and the native launch coordinator start direct children without a shell, verify contained artifacts, isolate per-profile paths, observe exit, and terminate/reap owned children. Host-selected installed games may require bounded heartbeat/process-exit recovery inside the same idempotent request, including cancellation during an attempt or restart backoff. The connected API path deliberately has no resource-fault file yet. Descendant process groups, sandboxing, compositor association, window readiness, protected probe producers, and hostile-child cancellation are not proven.
9. **Writable device state to maintenance and recovery.** Profiles, portraits, saves, logs, imports, staged packages, update slots, rollback state, and factory reset are planned as separate local stores. The current prototype's profile names are volatile and no production vault/save/update/import service exists. Future code must preserve the no-backup/no-cloud rules and must not silently link deleted profiles to retained progress.
10. **Developer/build inputs to release artifacts.** Manifests, generated schemas, pinned dependencies, assets, scripts, and future signing tools cross from developer control into release authority. Current schema freshness, exact toolchain pins, manifest validation, and signed-catalog tests reduce accidental drift; reproducible images, protected signing, provenance, SBOM, and release separation remain open.

### Repository-wide invariants

- Normal tracking neither stores nor transmits raw frames, and microphone capture remains disabled by default.
- A game receives only the derived Motion profiles explicitly granted to its exact reviewed origin/session; it never receives raw camera authority through an unknown manifest extension.
- Hosted or local game code cannot capture or suppress the system's reserved recovery action.
- Web content cannot choose a native executable, filesystem path, hash, command, environment, writable root, qualification state, or signing identity.
- Installed native execution requires valid, non-rolled-back, target-correct signed metadata and artifacts whose bytes still match their bound hashes at use time.
- Paths derived from packages or imports remain beneath the intended canonical root despite traversal, symlink, archive, Unicode, case, or platform edge cases.
- Child processes and descendants cannot outlive ownership, evade cancellation, impersonate readiness, or inherit more device/filesystem/network authority than declared.
- Offline-required features do not gain undeclared WAN dependencies or leak data when the network becomes available.
- Profile deletion, factory reset, uninstall, rollback, update, diagnostics, and import cleanup affect only their documented scope and do not silently reassociate sensitive identity.
- Protocols, parsers, queues, traces, logs, lifecycle histories, retries, and health checks are bounded and fail closed under malformed or stalled input.
- Compatibility, rights, permission, health, and readiness states are truthful. A valid public manifest or started process is not represented as installed, qualified, visible, responsive, or safe.

### Assumptions and explicit exclusions

- The current desk prototype runs on a development workstation and is not target-Linux qualification.
- Browser, OS, compositor, GPU, camera-driver, kernel, firmware, and hardware-root vulnerabilities are considered dependency/platform risks; this repository is responsible for safe configuration, pinning, update response, and containment but cannot repair those components here.
- Physical destruction, invasive hardware extraction, and an already-unrestricted root attacker are outside application-level prevention. Recovery, encryption, read-only roots, and key separation should still reduce persistence and data exposure.
- Casual household leaderboards are explicitly unverified. Ordinary cheating without crossing a privilege, privacy, integrity, or availability boundary is not a security vulnerability.
- Future installer, update, import, persistent profile, portrait, save, paired developer, and service-manager code is in scope for design threats but cannot have a present code vulnerability before it exists.
- Denial of one voluntarily launched untrusted game is less severe than denial of boot, Home/Back, tracker recovery, update rollback, or the whole console.

## Attack Surface, Mitigations, and Attacker Stories

### Camera, tracking, Motion data, and profiles

Relevant classes include unintended capture, raw-frame retention or egress, microphone activation, worker-message confusion, stale-run frame acceptance, unbounded traces, capability overgrant, skeleton re-identification, adversarial poses, false privileged actions, profile misidentification, portrait leakage, and diagnostic/crash-dump exposure.

Present controls include `audio: false`, no rendered camera pixels, one-frame backpressure, run IDs, local worker inference with main-thread fallback disclosed, image closure, schema validation, bounded skeleton-only traces, explicit Motion capability negotiation, per-profile frame projection, acknowledgement backpressure, and session expiry. The browser test suite observes no external requests or persistent browser stores during normal camera mode.

Important attacker stories are a hostile game requesting richer landmarks than approved; a same-origin compromise inheriting an origin allowlist; a crafted scene causing false join/Back/pause; a stale worker result crossing camera restart; or future support/log tooling accidentally including frames, portraits, body measurements, or linkable traces. Required follow-up includes OS/device permission tests, crash/swap inspection, legal/privacy review for body matching and portraits, sensitive-store encryption and deletion, adversarial action scoring, and negative export/support-bundle tests.

### Browser games, navigation, and Motion bridge

Relevant classes include XSS in the trusted shell, compromised approved origins, `postMessage` origin/source confusion, capability escalation, replay/session fixation, navigation to an unapproved origin, pop-up/download/protocol-handler escape, pointer-lock/full-screen capture, browser permission prompts, cookie/storage cross-contamination, and denial through message or frame floods.

Exact origin/source checks, schema/version validation, requested-capability negotiation, data projection, per-session IDs, ACK gating, rate limits, and expiry materially constrain the cooperative bridge. The hosted supervisor validates the initial and redirected health-check origin and uses a private browser profile, but it does not yet contain navigation after launch.

Threat tests should include hostile same-window and sibling-window messages, allowed-origin compromise, redirects after readiness, pop-ups, downloads, custom schemes, `file:` attempts, permission requests, pointer lock, nested full-screen, focus theft, storage persistence, high-rate messages, hung renderers, and reserved Home/Back during each state. Approval and emergency revocation must be version/origin scoped rather than a permanent endorsement.

### Loopback host and privileged launch IPC

Relevant classes include bearer discovery or leakage, DNS/origin confusion, CORS mistakes, CSRF-like requests, token comparison leaks, request smuggling, oversized/slow bodies, route confusion, JSON ambiguity, replay/conflict bugs, lifecycle enumeration, native-detail leakage, cancellation races, and denial of the single active launch slot.

Present controls include IPv4-only ephemeral binding, OS-random 256-bit bearer tokens, fragment delivery, exact loopback origin validation, constant-time token comparison, exact CORS preflight, `no-store`, short I/O deadlines, strict size limits, duplicate security-header and transfer-encoding rejection, closed JSON shapes, 128-bit request IDs, bounded lifecycle history, one active child, and non-sensitive response fields.

The realistic high-value story is script execution in the trusted launcher origin or unintended navigation that reads the fragment/in-memory token and then invokes authenticated launch operations. Another local origin without the token should not succeed. Follow-up should test browser history, crash reports, screenshots, extension policy, referrers, logs, speculative requests, hostile local listeners, port reuse, slowloris concurrency, host restart ambiguity, and token destruction when the browser or host exits.

### Signed catalog, packages, updates, and rollback

Relevant classes include signing-key theft, signature bypass, parse-before-verify, canonicalization disagreement, target confusion, duplicate IDs, manifest misbinding, hash substitution, symlink/time-of-check races, downgrade and freeze attacks, partial installation, low-space corruption, rollback to incompatible data, key-revocation failure, and mixing developer artifacts with production.

Current catalog code verifies signatures before parsing, uses a domain-separated signed message, accepts canonical key/signature encodings, rejects unknown fields and wrong targets, validates bounded IDs/versions/records, contains canonical files beneath host roots, binds manifest identity, and re-hashes launch artifacts. Tests cover tamper, path escape, misbinding, target, duplicate, size, and post-load artifact change cases.

The remaining trust chain is intentionally incomplete: public-key provisioning is configurable, generation is not persisted as anti-rollback state, package staging/promotion does not exist, and verification-to-execution immutability is not proven. Production design needs offline-root/online-role separation, revocation and threshold policy, monotonic per-channel state, atomic fsync-backed promotion, read-only versioned package mounts or descriptor-based execution, crash/power-loss campaigns, bad-release rollback, and a separately visible developer namespace.

### Native child, watchdog, emulator, and imported content

Relevant classes include shell/argument injection, path escape, unsafe inherited environment or handles, malicious emulator/core/content parsing, writable configuration abuse, child escape, descendant survival, heartbeat spoofing, readiness spoofing, restart loops, save corruption, cross-profile data access, GPU/device overprivilege, and cancellation failure.

The host launches direct commands rather than shell text, verifies canonical paths and hashes, generates isolated runtime/config/save/state directories, has managed-child cleanup, and provides bounded watchdog policy with startup/heartbeat/fault states. API launches use startup/heartbeat/process-exit supervision only when privileged host configuration assigns the verified installed game to the watchdog set; the setting applies consistently across player profiles and other games stay process-only. Retries cannot create a second request record, and runtime heartbeat health never becomes window-readiness authority.

Retro content remains untrusted regardless of entitlement. Before import or family-mode launch, emulator/core processes need a target-specific least-privilege sandbox, read-only code/content, isolated writable saves, restricted devices/network, descendant process-group ownership, corrupt-content tests, and exact core/content rights. Heartbeats must be authenticated or host-owned enough that a compromised child cannot claim the intended visible window is healthy; compositor observation remains authoritative for visibility.

### Writable state, diagnostics, developer mode, and maintenance

Relevant classes include secret/PII logging, log injection or disk exhaustion, cross-game save access, quota bypass, profile deletion that leaves linkable remnants, unassigned-progress reassociation, insecure reset, malicious USB/LAN archives, paired-key theft, unattended developer listeners, unsigned-code confusion, update interruption, and recovery media that includes household data.

The repository already states local-only/no-backup boundaries and separates intended stores conceptually, but production brokers are not implemented. Safe implementation requires per-game identities and quotas, atomic writes, bounded/redacted structured logs, deliberate consented export, archive extraction limits, staging cleanup, no source-path retention, session-scoped LAN authority, protected paired keys, visible developer state, revocation, factory-reset verification, and tests proving profiles/portraits/body data never enter saves, diagnostics, recovery images, or cloud paths.

### Supply chain and developer tooling

Relevant classes include dependency compromise, malicious install scripts, generated-schema drift, model/asset substitution, compromised CI secrets, unsafe release automation, and signing production artifacts from an ordinary development environment.

The repository pins Node, pnpm, Rust, crates, JavaScript dependencies, local MediaPipe assets, and checked-in schemas; lockfile policy, generated-schema freshness, strict type/build/test gates, Rust formatting/Clippy, and catalog signature tests provide useful assurance. They do not replace provenance verification, dependency review, reproducible builds, artifact attestations, protected signing, SBOM/notices, secret isolation, or review of changes to workflow and release authority.

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

Examples include unauthenticated lifecycle metadata enumeration without token disclosure; a Motion capability/session bug that leaks skeleton fields to another already approved origin; a child that consumes the single launch slot until host restart but cannot escape; cross-game save access limited to one local account; diagnostics containing stable identifiers or excessive skeleton traces; or a malformed manifest/IPC request causing a controlled host crash.

Severity rises when the data is linkable to children, the denial removes recovery/boot rather than one game, or a seemingly bounded issue composes with navigation or token leakage.

### Low

A low issue has minor confidentiality or robustness impact, needs narrow local timing/control, or affects only developer-facing tooling without entering release authority.

Examples include disclosure of already public package ID/version/target metadata; a local household user cancelling another user's current game in the credential-free model; unbounded cosmetic error text that does not reach logs or storage limits; or a dry-run/tooling failure that cannot change trusted artifacts.

Ordinary gameplay cheating, visual polish defects, inaccurate vendor capability claims caught before qualification, and crashes confined to an explicitly unapproved developer build are generally not security findings unless they cross a documented privilege, privacy, integrity, or appliance-availability boundary.
