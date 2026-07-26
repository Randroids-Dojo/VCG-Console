# Remote game manifest, service-worker, and offline audit

Evidence date: 2026-07-24

Status: bounded live-browser evidence; I-096 remains active

Qualification result: zero offline packages qualified

## Outcome

All 26 URLs in the 2026-07-19 VibeCoded.Games snapshot completed an initial
online navigation and a second online reload in a new anonymous browser
context. Only Block-You loaded a document after that context was taken
offline.

The v2 successor separately gave every title a new persistent profile, loaded
it online twice, closed the browser, relaunched Chrome against the same profile
with context-level offline mode set before navigation, and removed the profile
after the restarted browser closed. All 26 two-load primes and all cleanup
steps succeeded. Only Block-You loaded a document after the cold browser
restart; the other 25 failed with `net::ERR_INTERNET_DISCONNECTED`.

Neither result establishes complete offline play. Block-You reached
`document.readyState=complete` with its active `/sw.js` controller and
`block-you-v1` cache after restart, but the run did not interact with gameplay,
input, audio, saves, required assets, quota, cache reset, update/rollback, or
recovery.

Three titles linked a parseable web manifest:

- VibeBots;
- Asymptotic Bitrot; and
- Block-You.

Only Block-You had an active service-worker registration after the online
reload. Its explicit service-worker update request succeeded, its
`block-you-v1` Cache Storage container was present, and its offline reload
loaded. Asymptotic Bitrot exposed a fetch-handling worker and populated an
`asymptotic-bitrot-v1` cache, but no active registration was observed and its
offline reload failed. VibeBots exposed a push/notification worker without a
fetch handler, did not register it during this route, and failed its offline
reload.

The authoritative current evidence is
[`remote-game-offline-observation-v2.json`](../compliance/hosted-game-offline/remote-game-offline-observation-v2.json).
It binds all 26 observation records with SHA-256
`8a85aaf7ce5c03d72c9751bd4aa9ab349b73ad0de29658c6b7b0287b073535b0`
and explicitly records `offlinePackageQualifiedCount: 0`.
[`remote-game-offline-observation-v1.json`](../compliance/hosted-game-offline/remote-game-offline-observation-v1.json)
remains immutable historical evidence for the earlier same-context-only run.

## Exact procedure

The generator used installed Google Chrome `150.0.7871.182`, Node `24.18.0`,
Windows x64, and a 1920 x 1080 viewport. For every entry, the anonymous-context
branch:

1. navigated online to the catalog URL and waited for
   `DOMContentLoaded` plus 1.5 seconds;
2. recorded manifest links, service-worker registrations, storage container
   names, storage keys, origins, request methods, response statuses, and
   failure counts without storing values, bodies, query strings, or request
   paths;
3. performed a second online reload;
4. asked each active service-worker registration to check for an update;
5. probed same-origin standard and discovered manifest/worker endpoints with
   GET, recording status, MIME, size, classification, and content SHA-256;
6. disabled networking at the browser-context boundary and attempted one
   reload with a 15-second timeout; and
7. destroyed the anonymous context.

The separate cold-restart branch then:

1. created one branded fresh persistent profile under the operating-system
   temporary directory;
2. navigated online and performed a second online reload, each through
   `DOMContentLoaded` plus 1.5 seconds;
3. recorded only the same bounded browser-state names and counts;
4. cleanly closed the first persistent browser;
5. relaunched Chrome against the exact same profile;
6. set Playwright context-level offline mode before navigating to the
   entrypoint;
7. recorded the bounded load result, state, and aggregate
   request/response/failure counts;
8. cleanly closed the restarted browser; and
9. verified removal of the branded real-directory profile.

No game was played. No form, login, consent, notification, purchase, or
permission surface was used. The observed request set contained no method
other than GET/HEAD/OPTIONS. Browser storage values, cookie values, response
bodies, console messages, and personal identifiers are excluded.

The main context is headless and browser-isolated, which Chrome reports as
incognito for installability diagnostics. The separate cold branch uses a
normal persistent profile only for its two browser processes, then deletes it.
Neither branch performs an operating-system PWA install. Context-level offline
mode is not an operating-system network namespace, cable pull, DNS failure,
captive portal, or intermittent-network test.

## Catalog-wide results

`Manifest` means a linked, parseable manifest response. `SW` means an active
registration after the second online load. A cache or database name proves
only that the origin created that container.

| Game | Manifest | SW/update | Browser data observed | Offline reload |
|---|---:|---:|---|---|
| VibeBots | Yes | No | 3 localStorage keys | Failed: disconnected |
| VibePinball | No | No | None | Failed: disconnected |
| VibeRacer | No | No | None | Failed: disconnected |
| VibePins | No | No | None | Failed: disconnected |
| Bone Cleaver | No | No | `boneCleaver_settings` localStorage key | Failed: disconnected |
| Vibeman (Hangman) | No | No | None | Failed: disconnected |
| Asymptotic Bitrot | Yes | No | `asymptotic-bitrot-v1` cache | Failed: disconnected |
| Fracking Asteroids | No | No | None | Failed: disconnected |
| Hoops | No | No | None | Failed: disconnected |
| Mi Casa Es Su Casa | No | No | None | Failed: disconnected |
| Block Punch Kick | No | No | None | Failed: disconnected |
| Epoch | No | No | None | Failed: disconnected |
| GameTape | No | No | None | Failed: disconnected |
| GoPit | No | No | `/userfs` IndexedDB | Failed: disconnected |
| Block-You | Yes | Yes; update succeeded | `block-you-v1` cache | Loaded; play untested |
| Determined | No | No | None | Failed: disconnected |
| SoftwareDevSim | No | No | None | Failed: disconnected |
| Baby Piano | No | No | None | Failed: disconnected |
| Clankers | No | No | None | Failed: disconnected |
| VibeCity | No | No | None | Failed: disconnected |
| Flatline | No | No | None | Failed: disconnected |
| VibeGear2 | No | No | None | Failed: disconnected |
| Text Racer | No | No | None | Failed: disconnected |
| Drop Dead Keep | No | No | None | Failed: disconnected |
| Streamer Billboard | No | No | None | Failed: disconnected |
| GoDig | No | No | `/userfs` IndexedDB | Failed: disconnected |

## Cold browser-restart result

Every title completed both persistent-profile online loads, cleanly closed the
priming browser, relaunched the same profile with offline mode applied before
navigation, cleanly closed the restarted browser, and removed its profile.

| Result | Titles |
|---|---|
| Loaded a document after cold offline restart | Block-You |
| Failed with `net::ERR_INTERNET_DISCONNECTED` | The other 25 titles |

Block-You's restarted offline document retained title `Block-You`, complete
ready state, active `https://block-you.vercel.app/sw.js`, and cache name
`block-you-v1`. The observation recorded eight requests, eight browser
responses, and zero request failures; those counts describe the browser's
service-worker/cache path and do not establish that every gameplay asset or
feature was exercised.

The VibeBots route wrote:

- `vibebots-last-played-app-build`;
- `vibebots-last-played-app-version`; and
- `vibebots-mine-trip-v2-slot-1`.

The values were not captured.

## Manifest and worker identities

| Game | Endpoint | Bytes | SHA-256 | Relevant observation |
|---|---|---:|---|---|
| VibeBots | `/manifest.webmanifest` | 641 | `24dce750bfb8c33a9d5594c5a22eab1ce935f94da204aa36daa057fcc57123f7` | `start_url=/mine`, scope `/`, standalone, 5 icons |
| VibeBots | `/sw.js` | 1,138 | `07340f97c433187ced2fe30b1cedc00182f9f53b194fe4a54773d832132e32ac` | Push and notification-click listeners; no install, activate, or fetch listener |
| Asymptotic Bitrot | `/manifest.json` | 570 | `3e76c16fbe67552b9901bfd9fca436a902d134c9c28b38a677759cd87f730b2d` | `start_url=./`, standalone, 3 icons |
| Asymptotic Bitrot | `/sw.js` | 1,397 | `6a3f1de0b867a7eee509d07c960ac0d7810c2c9d0efd547a4b76612ac9753374` | Install, activate, and fetch listeners; no registration observed |
| Block-You | `/manifest.json` | 633 | `2eae07b0a27f8702c63dc239f1099d56f49d9d29d93c558c150583981dbc9f25` | `start_url=/`, standalone, 2 icons |
| Block-You | `/sw.js` | 3,561 | `8104d2eabaa441fa02ca11557fbfde3299255f32449597cdafffb822c1a8febd` | Install, activate, and fetch listeners; active registration observed |

The validator distinguishes a real manifest/JavaScript response from the many
deployments that return an HTML application shell for arbitrary
`/manifest.json`, `/manifest.webmanifest`, `/sw.js`, or `/service-worker.js`
paths. An HTTP 200 HTML fallback is not counted as a manifest or worker.
All six meaningful manifest/worker byte identities above were unchanged from
v1. Several mutable 404 response bodies changed without changing their 404
classification and confer no endpoint or offline capability.

## Fail-closed interpretation

- The checked-in launcher classification `network: required` remains truthful
  for VibeBots, Mi Casa Es Su Casa, and Determined.
- No other catalog title gains an offline or installable-package claim from
  this run.
- Block-You is the first candidate for a deeper offline-play experiment, not
  an admitted offline package.
- A hosted cache is origin-managed mutable state. It is not a signed,
  independently versioned VCG package and supplies no rollback, artifact
  identity, redistribution authority, or support commitment.
- A manifest without a fetch-controlling worker, a worker file without a live
  registration, and a successful offline document without complete gameplay
  are all insufficient evidence.
- GoPit and GoDig created Godot `/userfs` IndexedDB containers but their export
  configuration did not produce an observed worker registration or offline
  reload.

## Remaining evidence required

I-096 cannot close from this run. Each title still needs:

- ordinary gameplay and all required assets exercised before and after a
  network drop;
- complete cold offline gameplay plus save/load, reset, quota, cache deletion,
  and migration checks; v2 proves only a restarted document load;
- declared behavior for hosted identity, persistence, leaderboard, AI,
  messaging, media, analytics, notification, and other service routes;
- an exact source/build/deployment identity rather than only mutable public
  bytes;
- a persistent non-incognito installability run if PWA installation is an
  intended product lane;
- service-worker activation, waiting-worker, mixed-version, failed-update,
  cache-migration, and rollback tests;
- controller, reserved Home/Back, physical-TV, target-Linux, ARM64/x86-64, and
  browser-supervisor containment evidence; and
- rights and owner authorization before any hosted asset is copied into an
  offline package.

Decisions needed from the project owner are isolated in
[`OWNER_QUESTIONS_REMOTE_GAME_OFFLINE_2026-07-24.md`](OWNER_QUESTIONS_REMOTE_GAME_OFFLINE_2026-07-24.md).

## Reproduction and validation

The live generator intentionally writes the v2 successor and should be run
only when refreshing that evidence. The v1 historical artifact is not
overwritten:

```text
node scripts/generate-remote-game-offline-evidence.mjs
```

Deterministic local validation performs no network access:

```text
node scripts/validate-remote-game-offline-evidence.mjs
node --test scripts/validate-remote-game-offline-evidence.test.mjs
```

The validator requires canonical bounded UTF-8 JSON, the exact 26-entry
inventory and endpoints, closed fields, privacy-safe URLs, internally
consistent same-context and cold-restart lifecycle records, exact close/
restart/offline-before-navigation/profile-removal facts, a game-record digest,
derived summary counts, the zero-qualification result, and the exact claim
limitations. Nine adversarial test groups additionally reject fabricated
restart/cleanup, late offline configuration, impossible request counts, and
hidden values in the persistent-profile observation.
