# Remote game manifest, service-worker, and offline audit

Evidence date: 2026-07-24

Status: bounded live-browser evidence; I-096 remains active

Qualification result: zero offline packages qualified

## Outcome

All 26 URLs in the 2026-07-19 VibeCoded.Games snapshot completed an initial
online navigation and a second online reload in a new anonymous browser
context. Only Block-You loaded a document after the browser was taken offline.
That result does not establish complete offline play: the captured document had
the expected title and a small text surface, but no game interaction, save,
audio, asset-completeness, restart, or update-rollback path was exercised.

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

The authoritative evidence is
[`remote-game-offline-observation-v1.json`](../compliance/hosted-game-offline/remote-game-offline-observation-v1.json).
It binds all 26 observation records with SHA-256
`b51afa7c8dd4ac9dd6ca2a7a4911c166bd43aa224410d7ef0414e0c3b97a9973`.
The artifact explicitly records `offlinePackageQualifiedCount: 0`.

## Exact procedure

The generator used installed Google Chrome `150.0.7871.182`, Node `24.18.0`,
Windows x64, a 1920 x 1080 viewport, and a separate new Playwright browser
context for each title. For every entry it:

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

No game was played. No form, login, consent, notification, purchase, or
permission surface was used. The observed request set contained no method
other than GET/HEAD/OPTIONS. Browser storage values, cookie values, response
bodies, console messages, and personal identifiers are excluded.

The context is headless and browser-isolated, which Chrome reports as
incognito for installability diagnostics. The run therefore observes the web
manifest and service-worker lifecycle, not an operating-system PWA install.

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
- cold offline launch, restart, save/load, reset, quota, and migration checks;
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

The live generator intentionally rewrites the dated observation and should be
run only when refreshing evidence:

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
consistent lifecycle records, a game-record digest, derived summary counts,
the zero-qualification result, and the exact claim limitations. Eight
adversarial test groups cover catalog substitution, promotion, digest and
summary drift, captured-secret-shaped fields, unsafe URLs, inconsistent
endpoint/update records, unknown fields, environment drift, and encoding/size
bounds.
