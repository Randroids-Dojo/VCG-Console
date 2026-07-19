# VibeCoded game compatibility snapshot

Snapshot date: 2026-07-19

The source of truth inspected for this snapshot is `VibeCoded.Games/src/games.ts`. It currently contains 26 catalog entries: 23 first-party entries with GitHub repositories and 3 promoted community entries without repository links in that catalog.

Every live URL returned HTTP 200 during the snapshot. That means only that the initial route was reachable. It does not establish controller playability, framing, offline support, authentication, service availability, content rights, or ARM64 compatibility.

## First compatibility-set source audit

The three selected repositories were refreshed to current `origin/main` on 2026-07-19. This is a source/service classification, not a controller or target-hardware pass.

| Game | Reviewed commit | Current dependency shape | Initial console classification |
|---|---|---|---|
| VibeBots | `5b5d17efd3cd29c5cdbdc6e8f3eadf6d7173e602` | Next.js 16, React Three Fiber, guest/local behavior, many server routes, Neon persistence, optional Clerk identity, Web Push | Supervised hosted top-level first. A controlled local package must explicitly replace or retain each service and production-origin dependency. |
| Mi Casa Es Su Casa | `0c868be698360385d4a613fdca689faf0a2b82ca` | Next.js 15, Three.js, Vercel KV character/layout/message APIs, server validation and feedback integration | Hosted-service-required today. Offline packaging is an application adaptation with local persistence and feature-scope decisions, not a static mirror. |
| Determined | `7d9a38dc2c64915808c4a0a7081133ebb1865eec` | Static frontend and localStorage cache plus Groq generation and Vercel KV API routes/leaderboard | Best first degraded-local-package experiment. Prove fallback play, label unavailable hosted features, and prevent indefinite service waits. |

Live header checks on the same date returned 200 for all three. VibeBots redirected to `/mine`. Epoch still returned a restrictive `frame-ancestors` policy that excludes a VCG origin, so supervised top-level launch remains its correct initial mode.

## Current catalog

`Reachable` is the only completed check below. `Console test` remains open until the hands-on matrix is run on the kiosk build.

| Game | Catalog class | Current technology signal | Live URL | Reachable | Known concern or next test |
|---|---|---|---|---|---|
| VibeBots | First-party | TypeScript, hosted identity/service | [launch](https://vibebots.randroid.dev) | Yes | Authentication, gamepad/remote, offline degradation, production-origin assumptions |
| VibePinball | First-party | TypeScript, 3D arcade | [launch](https://vibe-pinball.vercel.app) | Yes | Gamepad, audio, frame pacing, TV fit, pointer interaction |
| VibeRacer | First-party | TypeScript, 3D racing | [launch](https://vibe-racer-three.vercel.app) | Yes | Gamepad, pointer lock, performance, exit chord |
| VibePins | First-party | TypeScript, bowling | [launch](https://vibe-pins.vercel.app) | Yes | Input mapping and motion-adaptation candidate |
| Bone Cleaver | Community | Web fighting game | [launch](https://bonecleaver.vercel.app/) | Yes | Source/license, trust tier, controller support, framing |
| Vibeman (Hangman) | Community | Web word game | [launch](https://hangman-exe.vercel.app/) | Yes | Text input, CSP review, TV keyboard need, source/license |
| Asymptotic Bitrot | Community | Web math/high-score game | [launch](https://asymptoticbitrot-um9i.vercel.app) | Yes | Manifest signal, source/license, input and framing |
| Fracking Asteroids | First-party | TypeScript arcade | [launch](https://fracking-asteroids.vercel.app) | Yes | Gamepad mapping, audio, offline/license audit |
| Hoops | First-party | JavaScript, HTML5 Canvas | [launch](https://hoops-kappa.vercel.app) | Yes | Pointer/touch assumptions and motion-adaptation candidate |
| Mi Casa Es Su Casa | First-party | Three.js, persistent service | [launch](https://mi-casa-es-su-casa.vercel.app) | Yes | Identity/persistence, keyboard/mouse, network-loss behavior |
| Block Punch Kick | First-party | JavaScript, 3D fighter | [launch](https://block-punch-kick.vercel.app) | Yes | Strong motion-adaptation candidate; controller and pointer-lock audit |
| Epoch | First-party | TypeScript strategy | [launch](https://epoch-theta.vercel.app) | Yes | Current CSP allows framing only by self and randroid.dev; use top-level launch or update headers |
| GameTape | First-party | HTML analytics/replay | [launch](https://game-tape.vercel.app) | Yes | Determine whether this belongs in a game-console catalog; mouse/keyboard needs |
| GoPit | First-party | Godot 4.5 web export | [launch](https://go-pit.vercel.app) | Yes | WebAssembly load, service worker, audio, gamepad, ARM browser memory |
| Block-You | First-party | JavaScript browser game | [launch](https://block-you.vercel.app) | Yes | Manifest signal, gamepad/remote, offline audit |
| Determined | First-party | JavaScript, LLM/service | [launch](https://determined-khaki.vercel.app) | Yes | Network/API requirement, text input, data policy, offline state |
| SoftwareDevSim | First-party | TypeScript simulation | [launch](https://software-dev-sim.vercel.app) | Yes | Mouse/keyboard and TV-readability audit |
| Baby Piano | First-party | TypeScript music | [launch](https://baby-piano-eight.vercel.app) | Yes | Audio latency, multi-touch assumptions, child/privacy review |
| Clankers | First-party | JavaScript card battler | [launch](https://clankers-mocha.vercel.app) | Yes | Pointer-heavy UI, text size, controller navigation |
| VibeCity | First-party | TypeScript, 3D driving | [launch](https://vibe-city-weld.vercel.app) | Yes | GPU/frame pacing, gamepad, pointer lock, exit chord |
| Flatline | First-party | TypeScript, Doom-like | [launch](https://flatline-gamma.vercel.app) | Yes | Pointer lock, gamepad, performance, exit chord |
| VibeGear2 | First-party | Web game | [launch](https://vibe-gear2.vercel.app) | Yes | Only first-party repo with recognized SPDX license in this snapshot; still test assets/build/offline |
| Text Racer | First-party | TypeScript text/racing | [launch](https://text-racer.vercel.app) | Yes | Physical keyboard dependency and console-suitable alternate input |
| Drop Dead Keep | First-party | TypeScript game | [launch](https://drop-dead-keep.vercel.app) | Yes | Runtime/input/fullscreen/license audit |
| Streamer Billboard | First-party | TypeScript experience | [launch](https://streamer-billboard.vercel.app) | Yes | Decide console relevance; network/media/input audit |
| GoDig | First-party | Godot web export | [launch](https://go-dig.vercel.app) | Yes | WebAssembly/service worker, audio, input, ARM browser memory |

## Hands-on console test matrix

Each game receives a dated record with exact browser, console OS, hardware, commit/deployment, resolution, and network state.

| Area | Checks | Passing condition |
|---|---|---|
| Launch | TLS, redirect, frame/top-level policy, load timeout, health check | Predictable playable or clearly unavailable state |
| Navigation | Remote/controller selection, back, Home, quit, focus recovery | No keyboard or mouse required for ordinary play and recovery |
| Input | Gamepad mapping, pointer lock, touch assumptions, keyboard text, simultaneous controllers | Declared input profile matches actual behavior |
| Video | 720p, 1080p, 4K output, TV safe area, DPI, full-screen, frame pacing | Critical UI visible and game responsive at supported modes |
| Audio | Autoplay, focus change, HDMI route, suspend/resume, volume | Sound begins predictably and does not leak after exit |
| Storage | Cookies, IndexedDB/localStorage, quotas, reset, migrations | Saves are isolated, recoverable, and deletable |
| Network | Cold offline, drop during play, reconnect, slow service | Manifest accurately declares required/optional/offline behavior |
| Security | CSP, frame policy, navigation escape, pop-ups, external links, permissions | No silent policy bypass or escape into general browsing |
| Appliance | crash, hang, out-of-memory, update during downtime | Watchdog returns to launcher and preserves other games' data |
| Licensing | code, fonts, music, images, models, service data, redistribution permission | Remote-only or local package classification is documented |

## Proposed game manifest contract

Required fields:

- identity: schema version, stable ID, title, semantic version, publisher;
- runtime: remote web, local web, native, or libretro plus entrypoint and architectures;
- lifecycle: minimum console version, launch timeout, health check, suspend, shutdown, and exit behavior;
- input: controller, remote, keyboard, pointer, touch, `motion.v1`, simultaneous-player limit, and remap policy;
- permissions: motion presence, skeleton, gestures, raw camera, microphone, network, identity, persistent storage, and external navigation; microphone is unavailable by default under D-046 and is not grantable until a future explicit product decision defines it;
- network: required, optional, or offline-capable plus permitted origins;
- presentation: aspect ratio, minimum resolution, safe area, orientation, full-screen, and age/content metadata;
- storage: quotas, save paths/origin, migration entrypoint, cloud dependency, export and reset support;
- integrity: package hashes, signature, signer, update URL/channel, and rollback compatibility;
- package lifecycle: independently versioned install, health check, activation, rollback, uninstall, and garbage collection under D-051;
- trust mode: production-signed or authenticated-session developer build; developer builds are visibly isolated and unavailable in family mode under D-054;
- rights: code license, content license, source URL, notices, redistribution authorization, and territory limits;
- diagnostics: log policy, crash marker, privacy-safe health data, and support link.

## Runtime policy proposal

1. Launch approved hosted games whose code or deployment VCG does not control as supervised top-level fullscreen browser sessions by default.
2. Keep reserved Home/Back, origin and external-navigation policy, loading, watchdog, crash recovery, and process termination outside the hosted webpage.
3. Use iframe embedding only as an explicit cooperative integration when the game permits framing and a required parent-shell feature justifies it.
4. Package games whose code and redistribution rights VCG controls as signed local packages by default, with reproducible builds and explicit remaining service dependencies.
5. Choose bundled-web or native/Godot payloads per game using measured ARM64/x86-64 portability, performance, input, motion, offline, package-size, security, reproducibility, and maintenance evidence. Do not equate a service worker with full offline capability.
6. Never strip another deployment's browser security headers to make it appear compatible.
7. Display network and input requirements before launch, with a controller-accessible unavailable state.
