# Online and offline service matrix

Last updated: 2026-07-23

This matrix implements D-034's offline-core requirement. It defines which VCG surfaces must work without WAN or LAN connectivity, which may improve when connected, which are explicitly network-required, and how failure returns to a controller-accessible console state.

The matrix is an intended contract plus an honest implementation snapshot. “Required offline” does not mean every current desk path has target-hardware evidence. “Network-required” does not grant undeclared origins, services, data classes, background activity, or raw camera access.

## Network classes

| Class | Meaning |
|---|---|
| `offline-required` | The complete named core behavior must work with all network interfaces disconnected. |
| `online-enhanced` | The primary local behavior works offline; declared online features may be unavailable. |
| `network-required` | The surface cannot provide its primary content offline and must say so before launch. |
| `scoped-lan` | No WAN is required, but a visibly enabled, authenticated local-network session is required. |
| `maintenance-only` | The running console remains usable offline; network is used only for an explicit update, acquisition, or review workflow. |

An offline test disables WAN before boot. A stricter isolation test disables every network interface. Results must name which condition was tested.

## Platform subsystem matrix

| Subsystem or surface | Class | Must work offline | Permitted connected behavior | Authority and data boundary | Current state | Required failure/recovery behavior |
|---|---|---|---|---|---|---|
| Boot, health checks, recovery, rollback | `offline-required` | Reach a controller-usable launcher or local recovery state; never require account login or an online boot token. | Check for updates only after the local system is healthy. | Verified local system slots and host-owned health state; no game origin participates. | Target image/rollback unimplemented. | Missing WAN never blocks boot. Local corruption enters branded recovery and preserves the last healthy slot where possible. |
| Primary launcher, navigation, settings shell | `offline-required` | Home, search over installed/cached metadata, Profiles, Settings, Motion, Retro, Back/Home, shutdown, and diagnostics entry. | Wi-Fi setup, update status, remote catalog freshness, and hosted reachability may refresh. | Trusted local launcher origin and Rust host only. | Browser launcher works; native settings persistence/services remain partial. | Show stale/unknown online data honestly; retain every local navigation and recovery action. |
| Controller/remote input and reserved Home/Back | `offline-required` | Discovery, mapping, focus, game escape, pause, retry, and exit. | Optional firmware or compatibility metadata updates occur outside play. | Native input host; games receive only non-privileged canonical actions. | Browser adapter exists; SDL3/global reservation unqualified. | Network loss has no input effect. Device loss exposes local reconnect/recovery UI. |
| Camera capture and body tracking | `offline-required` | Local camera, inference, calibration, portable skeleton, required actions, tracking-loss pause, and skeleton-only diagnostics. | No baseline cloud inference, upload, model fetch, or remote identity. Future remote behavior requires a superseding privacy decision. | Raw frames stay within the local capture/inference boundary; Motion clients receive only granted derived profiles. | Local pinned MediaPipe worker exists; native/Pi/Hailo paths unqualified. | Missing WAN is irrelevant. Camera/tracker faults pause locally and preserve controller recovery. |
| Motion web bridge | `offline-required` | Same-machine cooperative handshake, capability negotiation, projection, backpressure, reconnect, and replay. | None; `postMessage` is not network transport. | Exact source/origin and explicitly negotiated derived profiles; never raw frames. | Implemented for the desk cooperative path. | A missing/untrusted client receives no data; a stalled client expires without blocking tracking. |
| Obstacle sample and other installed core local games | `offline-required` | Primary gameplay, local input, local saves where implemented, pause/exit, and declared Motion profiles. | Optional declared online features may disappear without disabling primary gameplay. | Signed installed manifest and isolated local game storage; no network permission for offline packages. | Obstacle lab exists; signed package/install/save lifecycle remains unimplemented. | An online enhancement failure degrades locally with truthful status; it never traps launch or exit. |
| Installed controlled local-web/native package | `offline-required` or `online-enhanced` | Reviewed primary gameplay and console recovery. A family-mode installed package cannot make its primary loop network-required. | Only manifest-declared optional services and normalized allowed origins. | Rust host resolves the trusted installed manifest; browser may not supply paths, programs, hashes, or origins as authority. | Signed catalog resolution and fixed-intent process launch exist; installation, readiness, containment, and target qualification remain open. | Optional-service failure stays inside the shared branded slow/offline/retry/exit contract. |
| Local profiles, portrait/calibration vault, body-profile prediction | `offline-required` | Create, predict, confirm, correct, select, reset, delete, and recalibrate locally. | No cloud sync, backup, export, recovery copy, or remote matching. | Planned console-bound encrypted vault and deny-by-default broker. Games receive only opaque player/session outputs. | Prototype profile names are volatile; vault not implemented. | Network state is irrelevant. Vault/key failure discards affected device-only data explicitly and offers profile recreation. |
| Console-managed saves, achievements, and household leaderboards | `offline-required` | Read/write/reset local state and unassigned progress; preserve committed state through healthy update/rollback. | No console backup, migration, cloud sync, upload, public leaderboard, or anti-cheat service. Hosted-service data remains separately disclosed. | Per-game isolated local storage, separate from profile vault and retro content. | Bounded lifecycle/path/quota planner implemented; mutating broker and sandbox/mount enforcement not implemented. | Network loss cannot block local saves. Storage failure is reported honestly; no silent cloud fallback. |
| RetroArch frontend, curated cores, installed retro content | `offline-required` | Browse installed library, launch, play, save/state/remap under reserved controls, and return to launcher. | No core/content/artwork download during ordinary family play. | Trusted local package/content stores, exact hashes, per-profile paths, and no web origins. | Contained/hash-verified launch planning exists; artifacts/window/input unqualified. | Missing network is irrelevant. Missing/untrusted artifacts fail before mutation or launch and return to the Retro hub. |
| USB retro import | `maintenance-only` | Visible entitlement, scan, validation, hash, dedupe, quota, staged copy, and atomic install from attached media require no network. | No automatic commercial metadata, artwork, ROM, BIOS, or key retrieval. | Scoped removable-media reader into console-managed staging/content storage. | Not implemented. | Removal, malformed input, quota, or cancellation cleans staging and preserves the installed library. |
| Paired-LAN retro import and developer deployment | `scoped-lan` | Existing console content and family mode remain fully usable without LAN. | Accept content/builds only during a visibly enabled authenticated session; close on timeout, revocation, leaving developer mode, or reboot. | Paired workstation identity, explicit session, hashes, and host-owned install validation; no WAN trust inheritance. | Policy selected; importer/deployment service unimplemented. | Session or link loss stops intake, cleans partial staging, and never promotes unverified content. |
| Wi-Fi/network setup | `maintenance-only` | Launcher, local games, tracking, profiles, Retro, diagnostics, restart, and shutdown remain usable without configuration. | Scan, join, forget, captive-portal diagnosis, and connection test. | Native network service; credentials never enter games, diagnostics, or catalog data. | UI feedback prototype only. | Failure retains controller focus, exact error class, retry/forget/back, and an offline path. |
| OS, host, model, catalog, and package updates | `maintenance-only` | Continue running the last verified installed versions indefinitely, subject to explicit security/revocation policy. | Check/download into staging, verify signatures/hashes, install inactive slot/package, health-check, promote, and roll back. | Dedicated update trust roots and host service; games cannot update themselves into family mode. | Asset hashes exist; signed A/B and package update services unimplemented. | Offline means “not checked,” not broken. Interrupted or invalid updates never replace the current verified version. |
| Local diagnostics and evidence export | `offline-required` | View bounded health, versions, stable fault codes, and create deliberate local skeleton-only evidence. | No automatic remote telemetry or support upload. A future upload requires explicit scope, review, and consent. | Redacted bounded local logs; exclude frames, portraits, calibration vectors, credentials, save contents, and direct identifiers. | Browser status/trace export partial; bounded native logs unimplemented. | Export failure leaves diagnostics local and deletable; it never retries to a network destination silently. |
| Clock/time | `online-enhanced` | Boot, local play, saves, recovery, and monotonic duration measurement work with time marked uncertain. | NTP may correct wall-clock display and update freshness when permitted. | OS time service only; games do not receive network authority from clock sync. | Launcher displays local browser time; target policy unimplemented. | Invalid wall time cannot bypass signatures, expiry/revocation policy, ordering, or monotonic watchdogs. |
| VibeCoded Museum | `network-required` | The primary launcher and cached catalog metadata remain available; the remote museum experience does not. | Open the exact approved HTTPS top-level origin under host supervision. | Separate browser profile/origin with manifest policy; no launcher-host capability or Motion data by default. | Exact remote entry boundary exists; native containment/reachability unqualified. | Preflight shows the network requirement; offline/timeout returns to shared Retry, Details, and Exit. |
| Approved hosted game | `network-required` unless its reviewed manifest proves an offline lane | Console remains usable; the remote game may be unavailable. | Only declared HTTPS origins/services, storage, account, and permissions. | Per-game supervised top-level browser/profile; hosted code never receives host API, raw camera, profiles, or undeclared Motion access. | Browser supervisor/readiness spike; containment/global controls unqualified. | Check network/reachability, show truthful phases, enforce absolute timeout, and always preserve console-owned Home/Back/Exit. |
| Steam-specific store, login, cloud, and online games | `network-required` and account-bound | Core VCG launcher, tracking, local profiles/packages, and Retro work with no Steam account. | Steam features may use their own disclosed account/network contract. | Separate optional Steam boundary; never a prerequisite for core VCG authority. | Optional future compatibility lane. | Missing account/network hides or marks only Steam-specific features unavailable. |

## Current catalog matrix

| Game | Runtime | Declared network | Offline expectation | Current hosted dependencies/evidence | Launch behavior while offline |
|---|---|---|---|---|---|
| Determined | `remote-web` | `required` | No offline gameplay claim. A future local package requires separate rights and service replacement evidence. | Hosted generation, words, KV/cache, and leaderboard behavior remain to be classified. | Do not open the game origin; show Offline with Retry, Details, and Exit. |
| Mi Casa Es Su Casa | `remote-web` | `required` | No offline gameplay claim. A static mirror would not reproduce hosted character/layout/message/name/feedback routes. | Hosted routes are declared in manifest notes; compatibility remains unverified. | Do not open the game origin; show Offline with Retry, Details, and Exit. |
| VibeBots | `remote-web` | `required` | Guest/local-looking modes are not yet proof of an installable offline package. | Hosted server authority/persistence plus optional Clerk/notification behavior remain to be classified. | Do not open the game origin; show Offline with Retry, Details, and Exit. |
| Retro 2048 candidate | `libretro` | `offline` | Frontend/core launch and all ordinary gameplay must require no network. No content file is required. | Manifest forbids network permission/origins, but exact artifacts and target launch remain unqualified. | Network state is ignored; missing/untrusted local artifacts report `PACKAGE_NOT_INSTALLED` or integrity failure. |

The obstacle sample is not yet a catalog package. Its intended class is `offline-required`.

## Manifest and host enforcement

1. `network: offline` forbids the `network` permission. Curated `libretro` packages additionally require no web origins.
2. `network: optional` means primary local gameplay passes with every interface disabled. Every remote service and normalized origin is declared; unavailable features degrade without blocking console recovery.
3. `network: required` must be disclosed before launch and checked through the shared launch state. Family-mode installed local packages may not use this class for their primary loop; use `optional` and provide a real offline primary path, or keep the experience hosted.
4. `allowedOrigins` is an allowlist, not a service inventory. Review records the purpose, data classes, account requirement, retention owner, and failure behavior for each origin.
5. An HTTP health check grants no gameplay navigation or data permission. It is bounded, non-mutating, and cannot turn reachability into compatibility proof.
6. The Rust host resolves the signed installed manifest and network policy. The launcher supplies only a high-level catalog identifier; a game cannot self-promote origins or permissions.
7. The launcher-host bearer capability, profile vault, camera, raw frames, skeleton traces, Wi-Fi credentials, update keys, and diagnostics remain unavailable to hosted origins.
8. Background retries are bounded and visible when they affect launch. No subsystem may keep a game or the camera alive merely to wait for connectivity.

The current schema enforces the first rule and the strict libretro subset. Optional-service inventory, installed-local offline enforcement, native egress containment, and signed host resolution remain implementation tasks.

## Failure test matrix

Run each applicable surface under:

- interfaces disabled before cold boot;
- WAN unavailable with LAN present;
- DNS failure;
- connection refused and connection timeout;
- TLS/certificate failure;
- captive portal or intercepted reachability result;
- link loss during check, download, launch, ready gameplay, save, and exit;
- link restoration without automatic focus transfer or surprise launch;
- invalid or deliberately old wall clock;
- update/deployment/import interruption and reboot.

For every case record visible state, stable fault code, first feedback time, absolute timeout, retry count, Back/Home/Exit behavior, child cleanup, local data effects, and whether any undeclared request occurred.

## Qualification claim

A subsystem may be called offline-capable only after the exact target configuration passes with all interfaces disabled. A hosted game returning a cached page, a browser service worker, a previous login, Steam Offline Mode, a development server on LAN, or an inference model already resident in browser cache is not proof of an accountless, reproducible offline package.
