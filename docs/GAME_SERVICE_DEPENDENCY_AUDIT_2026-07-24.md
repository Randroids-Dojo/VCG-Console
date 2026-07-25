# Catalog game service-dependency audit

Evidence date: 2026-07-24

Status: exact-source and fresh-browser signal screen; I-097 remains active

Qualification result: zero verified degradation or offline claims

## Outcome

The screen covers all 26 entries in the 2026-07-19 VibeCoded.Games snapshot:

- 23 first-party repositories were downloaded temporarily and screened at the
  exact commits already bound by the first-party rights artifact;
- the three promoted community entries retain their fresh-browser observations
  but have no first-party repository link to screen;
- 15 first-party games expose one or more source API-route files;
- 16 reference one or more environment-variable names;
- 2 have authentication-shaped dependency or environment signals;
- 13 have database/KV/Redis-shaped signals;
- 1 has an AI-service signal;
- 1 has push-notification signals;
- no analytics or payment package/environment signal was detected by the
  bounded patterns;
- 23 have at least one external origin literal or fresh-browser third-party
  origin signal; and
- no title has a verified service-degradation contract or offline
  qualification.

The authoritative current artifact is
[`game-service-dependency-screen-v2.json`](../compliance/game-services/game-service-dependency-screen-v2.json).
Its 26 game records are bound by SHA-256
`16298d6ced48cd1bc76edeae12ca78e5e4812a28f6e999ed069171dad25827a9`.
The record digest is unchanged because the bounded source/browser signals did
not change; v2 advances the predecessor binding and leaves v1 immutable.

The screen is also bound to:

- first-party rights observation
  `a74854b7041f9c206433dd35cd8370825e26c710ceb58e2d1c0ddc2ae99f1e81`;
  and
- remote manifest/offline observation
  `8a85aaf7ce5c03d72c9751bd4aa9ab349b73ad0de29658c6b7b0287b073535b0`.

## Claim boundary

These are evidence locators, not owner declarations or a runtime call graph.
A package name, environment-variable name, route filename, URL literal, or
fresh-profile request origin can be unused, development-only, optional, or
reached only on one route. Static matching can miss generated endpoints,
dynamic configuration, binaries, submodules, deployment-only functions,
authenticated paths, and services activated after play or consent.

No environment values, request paths, query strings, request/response bodies,
cookies, storage values, console messages, or credentials are stored.
Temporary exact source archives are deleted after the bounded scan.

The source-text scan excludes:

- `AGENTS.md`;
- hidden/tooling, documentation, test, build, dependency, and vendor
  directories;
- symlinks;
- unsupported extensions; and
- text files larger than 512 KiB.

Those exclusions keep the screen bounded and oriented toward runtime source;
they also mean absence of a signal is not proof of absence.

## Catalog-wide matrix

`Auth`, `Data`, `AI`, and `Notify` mean at least one matching dependency or
environment-variable name. `API` is the number of route-shaped source paths.
`Env` is the number of distinct environment-variable names. Every row retains
`network required pending per-title review`, `degradation unverified`, and
`offline qualification none`.

| Game | Source | Auth | Data | AI | Notify | API | Env |
|---|---|---:|---:|---:|---:|---:|---:|
| VibeBots | Exact | Yes | Yes | — | Yes | 73 | 40 |
| VibePinball | Exact | — | — | — | — | 0 | 2 |
| VibeRacer | Exact | — | Yes | — | — | 13 | 9 |
| VibePins | Exact | — | Yes | — | — | 3 | 4 |
| Fracking Asteroids | Exact | — | Yes | — | — | 4 | 4 |
| Hoops | Exact | — | Yes | — | — | 3 | 8 |
| Mi Casa Es Su Casa | Exact | — | Yes | — | — | 7 | 9 |
| Block Punch Kick | Exact | — | — | — | — | 0 | 0 |
| Epoch | Exact | — | — | — | — | 2 | 5 |
| GameTape | Exact | — | — | — | — | 0 | 0 |
| GoPit | Exact | — | — | — | — | 0 | 0 |
| Block-You | Exact | — | — | — | — | 0 | 0 |
| Determined | Exact | — | Yes | Yes | — | 3 | 1 |
| SoftwareDevSim | Exact | — | Yes | — | — | 1 | 5 |
| Baby Piano | Exact | — | — | — | — | 1 | 1 |
| Clankers | Exact | — | — | — | — | 0 | 0 |
| VibeCity | Exact | — | Yes | — | — | 2 | 4 |
| Flatline | Exact | — | — | — | — | 0 | 2 |
| VibeGear2 | Exact | — | Yes | — | — | 4 | 20 |
| Text Racer | Exact | — | Yes | — | — | 1 | 0 |
| Drop Dead Keep | Exact | — | Yes | — | — | 3 | 1 |
| Streamer Billboard | Exact | Yes | Yes | — | — | 13 | 11 |
| GoDig | Exact; unresolved submodule | — | — | — | — | 0 | 0 |
| Bone Cleaver | No first-party source link | Unknown | Unknown | Unknown | Unknown | — | — |
| Vibeman (Hangman) | No first-party source link | Unknown | Unknown | Unknown | Unknown | — | — |
| Asymptotic Bitrot | No first-party source link | Unknown | Unknown | Unknown | Unknown | — | — |

The artifact contains every package name and version specification, every
environment-variable name, every route path, every retained origin, exact
source archive size/hash, scan counts, and the source commit for each
first-party row.

## High-confidence category signals

### Authentication

VibeBots references `@clerk/nextjs`, `AUTH_SECRET`, Clerk server/public keys,
and sign-in/sign-up route variables. Streamer Billboard references
`AUTH_SECRET`.

These signals do not establish whether authentication is required for ordinary
play, what identity is stored, whether a child account can exist, or how
account removal affects local data.

### Database and hosted persistence

Database/KV/Redis signals were found in:

- VibeBots (`DATABASE_URL`);
- VibeRacer, VibePins, Fracking Asteroids, Hoops, SoftwareDevSim, VibeCity,
  VibeGear2, and Streamer Billboard (`@upstash/redis` and/or related
  environment names);
- Mi Casa Es Su Casa, Determined, Text Racer, and Drop Dead Keep
  (`@vercel/kv` and/or KV environment names).

The exact route data, schemas, retention, tenancy, failure behavior, and
deletion authority remain unverified.

### AI

Determined references `GROQ_API_KEY`. The screen does not prove which prompts,
player inputs, generated outputs, identifiers, or retention policies apply.
Its current console classification must remain network-required until the
ordinary loop and fallback behavior are interactively tested.

### Notifications

VibeBots references `web-push`, VAPID key names, and a push contact-email
variable. The earlier browser audit found a push/notification-click worker but
no fetch handler or registration on the anonymous `/mine` route.

Notification permission, subscription data, child/privacy policy, opt-out,
expiry, deletion, and delivery failure remain unverified.

### Analytics and payments

No package or environment name matched the bounded analytics or payment
patterns. This is not a claim that analytics, telemetry, ads, sponsorship,
payments, or deployment-injected monitoring are absent. Owner declarations
and authenticated/interactive network observation remain required.

## Fresh-browser third-party origins

Eight titles contacted a third-party origin during the anonymous online
navigation/reload run:

| Game | Observed third-party origins |
|---|---|
| Mi Casa Es Su Casa | `fonts.googleapis.com`, `fonts.gstatic.com` |
| Block Punch Kick | `unpkg.com` |
| GameTape | `api.github.com`, `raw.githubusercontent.com` |
| Determined | `cdn.jsdelivr.net` |
| Clankers | `fonts.googleapis.com`, `fonts.gstatic.com` |
| Drop Dead Keep | `cdnjs.cloudflare.com` |
| Bone Cleaver | `unpkg.com` |
| Vibeman (Hangman) | `fonts.googleapis.com`, `fonts.gstatic.com` |

The other 18 titles did not contact a third-party origin during that narrow
route and timing window. They can still contact same-origin server routes or
additional origins after interaction.

## Fail-closed console interpretation

- Keep all 26 titles network-required pending per-title review.
- Do not convert a public source archive or browser cache into a local package.
- Do not expose host profiles, Motion data, saves, identifiers, diagnostics,
  or secrets to a service because its name appears in source.
- Do not describe a fallback as offline-capable until a complete ordinary loop,
  cold restart, required assets, save/load, and network-loss recovery pass on
  exact targets.
- Treat the three community titles as service inventory unavailable, not
  service-free.
- Treat GoDig's `dots` submodule as an unresolved source and dependency gap.

## Remaining evidence

I-097 cannot close until each game owner supplies and verifies:

- every production service, origin, operator, region, tenant, and support
  contact;
- required versus optional features and the exact user-visible degradation
  state for timeout, denial, quota, outage, malformed response, and removal;
- request/response data classes, identifiers, lawful/consent basis,
  retention/deletion, subprocessors, and cross-border behavior;
- anonymous, guest, child, local-profile, and authenticated account behavior;
- storage schemas, migration, export, reset, account deletion, and hosted/local
  boundary;
- deployment-injected analytics, logs, error reporting, ads, payment, and
  notification behavior;
- exact source/build/deployment identity for every server and client release;
  and
- interactive normal-play, network-drop, reconnect, slow-service, update, and
  permanent-service-removal evidence.

Owner decisions are isolated in
[`OWNER_QUESTIONS_GAME_SERVICES_2026-07-24.md`](OWNER_QUESTIONS_GAME_SERVICES_2026-07-24.md).

## Reproduction and validation

The live generator downloads exact public source archives to a bounded OS
temporary directory, scans them, removes the directory, and writes the
artifact:

```text
node scripts/generate-game-service-dependency-screen.mjs
```

The validator and adversarial tests perform no network access:

```text
node scripts/validate-game-service-dependency-screen.mjs
node --test scripts/validate-game-service-dependency-screen.test.mjs
```

The validator binds both predecessor artifacts; requires the exact 26-game
inventory, 23 exact commits, archive identities, community source gaps,
privacy-bounded browser observations, closed source/service fields, and
derived signals; refuses credential-shaped package metadata, unsafe paths and
URLs, hidden value fields, invented service signals, source/browser
substitution, and degradation/offline/catalog promotion; and enforces the
record digest, derived zero-qualification summary, exact limitations, bounded
canonical UTF-8 JSON, and nine adversarial test groups.
