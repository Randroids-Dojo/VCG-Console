# Owner questions: retro library

Date: 2026-08-18

Status: open choices accumulated while implementing
[the retro library play plan](RETRO_LIBRARY_PLAY_PLAN_2026-08-18.md)

These are the decisions that could not be made honestly from the code, the
plan, or the decisions already recorded. Each records a safe default that was
taken in the meantime, so nothing here blocks the work that is already done.

## RL-001: save, state, and remap scope for library entries

A library launch names a package for the core and an entry for the content. If
one package serves a whole system, every NES title shares one
`<data-root>/profiles/<profile>/games/<game>/` namespace. RetroArch names save
files after the content, so `.srm` files stay distinct inside it, but save-state
slots, input remaps, and core options are per-directory and would be shared
across every title in the system.

Shared core options are probably correct. Shared remaps are probably not: a
per-title button remap is exactly the kind of accessibility accommodation the
controller contract anticipates.

Resolved 2026-08-19 by observation on the Pi 5 target: the shared namespace is
correct and no per-entry namespace is needed.

RetroArch names save files and save states after the content, inside a
per-core subdirectory, so two titles under one package never collide:

```text
saves/Mesen/nes-content-01f1b54b….srm
saves/Mesen/nes-content-0201456d….srm
states/Mesen/nes-content-01f1b54b….state
```

Core options are named after the core (`Mesen.opt`) and are therefore shared
across every title that core runs, which is what a core option is. Game remaps
follow the same content-named convention as saves when saved as game remaps.

The concern that motivated this question — per-title accessibility remaps
leaking across a whole system — does not occur.

## RL-002: production content root

Content currently lives in the console account's home directory. The launch
path expects a host-owned content root provisioned by a privileged image step,
which `/var/lib/vcg/retro-content` would be.

Safe default taken: the home directory, because provisioning a privileged root
needs `sudo` on the target and was not authorized.

Question: should the appliance installer create and own
`/var/lib/vcg/retro-content`, and should the console account then lose write
access to it between provisioning and use? The verification-to-use race
recorded in [the RetroArch contract](RETROARCH_INTEGRATION.md) stays open until
it does.

Decided 2026-08-19: keep the console account's storage. The race is only
reachable by an attacker who already has code execution as that account, and
it does not truly close until descriptor-bound handoff or an immutable mount
lands. Revisit as one combined change at that point.

## RL-003: signed system policy for provisioning

`vcg-host retro-provision` takes `--policy-id`, `--policy-revision`, `--core`,
`--controller-profile`, and the capacity ceilings as command-line arguments.
They are operator claims, recorded so a reader can see what was asserted, not
release-bound facts. [The import contract](RETRO_IMPORT_CONTRACT.md) describes
a signed, release-bound policy as the production shape.

Safe default taken: no defaults are supplied for any ceiling, so an operator
must state every limit explicitly rather than inherit an unqualified one.

Question: should the plain-system policy become a signed release artifact
before the library is exposed to players, or is an operator claim acceptable
for a locally provisioned collection?

Decided 2026-08-19: make the plain-system policy a signed, release-bound
artifact rather than a command-line claim, so the system-to-core mapping and
the capacity ceilings become tamper-evident. Adding a system then requires
re-signing the policy.

## RL-004: reserved Home and Back

The base configuration binds Start+Select to RetroArch's own menu, which does
not satisfy [the reserved Home invariant](RESERVED_HOME_ACTION_CAMPAIGN_2026-07-26.md):
the frontend receives the input, the surface is the raw frontend menu, and a
hung core takes the escape path down with it.

Safe default taken: keep the interim binding, because removing it would leave a
running core with no controller-reachable exit at all, and add a launch-time
controller requirement so a player is never dropped into a session with no
input device.

Question: when should the privileged input router be built? It needs an evdev
backend behind `vcg_host::input::ShellAction`, and it must survive a frontend
taking an exclusive `EVIOCGRAB` on the event device.

Decided 2026-08-19: build the privileged input router. The host will own Home
and Back above the frontend, terminate the child, and return to the shell, and
the frontend menu combo is removed once it does. This implements the I-091
mechanism; it does not qualify it, which still needs physical multi-controller
testing on both reference targets.

## RL-005: duplicate and regional titles in the library

Titles are derived from filenames, so a collection contains
`Super Mario Bros. (U)` and `Super Mario Bros. (E)` as separate entries, plus
`[!]`, `[b1]`, and similar dump markers. The library list is keyed by content
hash, so duplicates cannot break it the way the curated shelf's title key
would, but a player browsing sees near-identical names.

Safe default taken: show the derived title exactly, including its markers,
because inventing a cleaned title would be a claim about which dump is
authoritative.

Question: should the shell group regional variants, hide known-bad dumps, or
keep showing exactly what the operator staged?

Decided 2026-08-19: group regional and revision variants under one title.
Grouping is presentational only -- every staged file remains reachable, the
full derived title is shown on the expanded row, and nothing is hidden or
renamed. The grouping key is the base name with trailing parenthetical and
bracketed markers removed, which is a display heuristic and not a claim about
which dump is authoritative.

## RL-006: curated shelf scope

Carried forward from the plan. Should any operator ROMs also appear on the
curated shelf, and if so who chooses them? Each shelf addition costs a browser
evidence regeneration and the shelf caps at 256 entries.

Safe default taken: none. The slice title is resolvable through the host but
does not appear on the shelf.

Decided 2026-08-19: a small hand-picked set may also appear on the curated
shelf. The owner names the titles; each costs a policy entry and a browser
evidence regeneration, so the set stays small by construction.

The selected set, with the exact staged content each tile binds:

| Title | System | Core | Content SHA-256 |
| --- | --- | --- | --- |
| Super Mario Bros. + Duck Hunt (U) | NES | mesen | `23ec3f6b…` |
| Metal Gear (U) | NES | mesen | `1abb14a6…` |
| Super Mario World 2 - Yoshi's Island (USA) (Rev 1) | SNES | snes9x | `bd763c1a…` |
| Donkey Kong Country 2 - Diddy's Kong Quest (U) (V1.1) | SNES | snes9x | `b79c2bb8…` |

Each is a managed-content package, not a library entry promoted onto the
shelf: a shelf tile carries a game ID and no entry ID. Their content root is
the console-managed object store, so a tile references the same bytes the
library already holds rather than storing a second copy.

The collection contains no standalone Super Mario Bros.; the combo cartridge
is the only copy staged.

## RL-007: catalog-load artifact verification

The launcher does not hash package artifacts when it loads a catalog;
`verify_all_artifacts` is a staging and promotion call. Digests are enforced
when a game is resolved and launched, and provisioning verifies at write time.
A tampered core therefore passes `vcg-host launcher --dry-run`.

Safe default taken: none required; this is existing behaviour and matches the
substitution caveat already recorded in
[the installed-catalog contract](INSTALLED_PACKAGE_CATALOG.md).

Question: should catalog load verify artifacts as well, accepting the startup
cost, or does resolve-time verification plus an immutable mount close this
adequately?

Decided 2026-08-19: verify package artifacts at catalog load as well as at
resolve. Measured cost on the Pi 5 is negligible -- the frontend and four cores
total roughly 30 MB, against 1.5 GB verified in about a second.

## RL-008: unstaged files in the collection

Six SNES archives were not staged. Five are byte-identical duplicates under
different filenames and need no action. One,
`Arabian Nights - Sabaku no Seirei Ou.zip`, contains a payload with no file
extension, so no canonical extension could be recorded for it.

Safe default taken: skipped and reported in `skipped.tsv` rather than guessing
an extension from the file size.

Question: rename the payload inside that archive and re-stage, or leave it out?

Decided 2026-08-19: leave it out. The file stays recorded in `skipped.tsv`
with its exact reason, and no extension is inferred on the operator's behalf.

## RL-009: forward-only library browsing

The library read endpoint pages with opaque, forward-only cursors that die when
the host restarts. There is no random access and no jump-to-index, because a
decodable cursor would let a client address entries the host had not published
to it. A 100,000-entry library is roughly 390 pages.

Safe default taken: forward-only. The shell browses by system and then title,
fetching pages sequentially.

Question: is sequential browsing acceptable for a player with a large
collection, or is a jump-to-letter affordance required? Adding one is a host
contract change, not a client workaround, because the host would have to
publish an addressable index.

Decided 2026-08-19: add a client-side alphabet jump over the entries the shell
already holds. No host contract change and no additional disclosure, because
the data is already in the browser after its one-time walk.

## RL-010: library launch journal schema version

The durable launch journal kept schema version 2 and made `entryId` an optional
field rather than bumping to version 3. A version bump would have made an
upgraded host reject its own existing on-disk journal and fail every launch
with `LAUNCH_REPLAY_UNAVAILABLE`. An older binary reading a newer record still
fails closed, because the record type denies unknown fields.

Safe default taken: no bump, optional field, forward-compatible on upgrade and
fail-closed on downgrade.

Question: is silent forward compatibility the intended upgrade policy for the
launch journal, or should a version bump plus an explicit migration be required
even when it costs a one-time journal reset?

Decided 2026-08-20: bump the journal to schema 3 with an explicit migration,
so a format change is stated rather than absorbed. The accepted cost is a
one-time reset, which means an interrupted launch may replay once.

## RL-011: JSON Schema is asserted, not executed

The workspace has no JSON Schema validator dependency, so
`schemas/retro-installed-library.schema.json` is checked by asserting its
structure rather than by executing it against documents. Runtime acceptance and
rejection are proven through the TypeScript parser instead. Agreement between
the schema and that parser therefore rests on explicit per-field assertions, not
on a shared execution path, and the two could drift without a test failing.

Safe default taken: structural assertions, matching how the repository already
treats its other exported schemas.

Question: should a schema execution dependency be added so the published schema
and the runtime validator are proven to agree on the same documents?

Decided 2026-08-20: add a schema validator and execute the published schema
against the same documents the TypeScript parser reads, so the two are proven
to agree rather than tested separately. This adds a dependency to a workspace
that pins every version exactly, so it is pinned exactly too.

Executing it found drift. The published `title` pattern excluded only C0
controls, `U+007F`, and the two path separators, so the schema accepted titles
the parser rejects: C1 controls, soft hyphens, zero-width and bidirectional
override characters, every non-ASCII whitespace form, lone surrogates, the
astral tag and musical format controls, and untrimmed leading or trailing
spaces. The pattern now mirrors the runtime rule. It rejects no document that
was already valid.

Three runtime rules stay outside the schema, and the suite records each: the
entry ID must derive from the entry's own `sha256`, entry IDs and system/hash
pairs must be unique, and a title must be NFC-normalized. Draft 2020-12 has no
keyword that compares two sibling values, no keyed uniqueness, and no
normalization. `uniqueItems` would catch only wholly identical entries and
costs a pairwise comparison across a 100,000-entry library, so it is not used.

## RL-012: identifier grammar mismatch between catalog and library

A signed catalog binds a library package with the bounded intent-ID grammar,
which excludes `.`. The retro library's own safe-ID grammar allows it. A library
system or core ID containing a dot could therefore never be bound by a package.

Safe default taken: none needed; the mismatch fails closed and no current
system or core ID contains a dot.

Question: should the two grammars be unified, or is the narrower catalog
grammar the intended constraint on what a package may name?

Decided 2026-08-20: narrow the library grammar so anything the library accepts
can be bound by a package. Identifiers that legitimately need a dot, if any
exist, keep a separate validator rather than being tightened along with the
rest.

## RL-013: the appliance boot path configures no catalog and no library

This is the largest remaining gap and it is not in the play plan.

`scripts/pi/systemd/vcg-console-session.service.in` starts the launcher with
only `--browser`, `--bluetoothctl`, `--cursor-nudge`, `--profile-dir`, and
`--url`. It passes no catalog, signature, install root, content root, data
root, replay root, profile ID, update-root trust material, channel, or
`--retro-library-root`. A booted console therefore runs the shell in
metadata-only mode: the signed catalog and the retro library both exist on the
target but neither is reachable from the session that actually starts at boot.

Everything Lane A and Lane B produced is exercised today through direct
command-line invocation, not through the unit that owns the TV.

Safe default taken: the unit was left alone. Rewiring appliance boot
unattended risks the operator's working console, and the correct paths depend
on RL-002, which is unanswered.

Two design problems have to be solved before it can be wired:

1. **Trusted time.** `--trusted-unix-seconds` takes a snapshot value. A
   systemd `ExecStart=` line cannot compute one inline, so this needs a small
   wrapper that resolves the snapshot and then execs the host, or a
   platform time adapter. The existing `wait-for-console.sh` `ExecStartPre`
   shows the wrapper pattern the repository already accepts.
2. **Where the trust material lives.** The catalog, signature, anchors,
   accepted-root store, and protected state need a host-owned location that
   the console account cannot rewrite between verification and use. That is
   the same privileged-root question as RL-002.

Question: should the installer gain optional catalog and library flags that
default to the current behaviour, so an operator opts in explicitly, or should
a provisioned appliance always boot with its catalog and library configured
and fail closed when they are absent?

Decided 2026-08-19: the installer gains optional catalog and library flags and
defaults to rendering today's unit exactly, so an existing console keeps
booting unchanged and retro is enabled deliberately.

## RL-014: the public manifest contract has no library content mode

The signed installed catalog now expresses `content.mode: "library"`. The
public game-manifest contract in `packages/game-manifest` does not: its
libretro content is `none` or `managed` only, and `none` additionally requires
a core that supports no-game startup, which Mesen does not.

A library package's installed-root manifest therefore satisfies the six fields
the native host actually reads, but would not validate against the public Zod
schema. That is not a contradiction today — library packages deliberately never
enter the public catalog, and the public schema governs that catalog — but the
two documents share a filename and a schema version while no longer describing
the same set of packages.

Safe default taken: the installed-root manifest states only what the host
reads and validates. Nothing was added to the public schema, because doing so
would imply library packages belong on the curated shelf, which RL-006 leaves
closed.

Question: should the public manifest contract gain a library content mode for
consistency, should installed-root manifests be recognised as a distinct
document type, or is the current split correct as it stands?

Decided 2026-08-19: name the installed-root document a distinct type rather
than overloading the public game manifest. The public document governs the
curated shelf and keeps `none` and `managed`; the installed-root document is
recognised separately and carries the library mode. This is the largest of the
three options and touches the schema, its export, and its validation.

## RL-015: per-core options escape the console-managed roots

Found 2026-08-19 while resolving RL-001, on the Pi 5 target.

[The RetroArch contract](RETROARCH_INTEGRATION.md) states that the generated
append configuration "redirects every mutable directory used by this slice"
into the console-managed paths. That claim is incomplete. RetroArch writes
per-core option files to its own configuration directory, which no generated
key currently redirects:

```text
~/.config/retroarch/config/Mesen/Mesen.opt
```

`core_options_path` does not cover it: that key names the global options file,
while per-core options are written beneath RetroArch's configuration
directory. Observed with the exact generated key set, with
`config_save_on_exit` disabled, and with the base configuration supplied.

Adding `rgui_config_directory`, pointed at the existing per-game `config`
directory, contains it. Verified: with that key added to the same key set, a
full run left nothing at all under `~/.config/retroarch`, and the option file
landed under the managed path instead.

Safe default taken: none available. This is a defect, not a choice, so the key
is being added to the generated configuration rather than recorded and left.

Question for the owner is only the scope: per-core options are shared by every
title a core runs, which is the correct meaning of a core option. If per-title
core options are ever wanted, that is a separate RetroArch feature
(`game_specific_options`) and a separate decision.

## RL-016: deterministic boot failures now restart forever

Found 2026-08-19 as an interaction between two changes that landed in
parallel, which neither could see on its own.

`scripts/pi/systemd/vcg-console-session.service.in` sets `Restart=always`,
`RestartSec=3`, and `StartLimitIntervalSec=0`. The rate limit is disabled
deliberately: a console that stops restarting is a dead television, and a
crashing browser must always come back.

That was safe while the session started metadata-only, because the launcher had
almost no way to fail deterministically at startup. Two changes removed that
property:

- RL-007 made catalog load verify every package artifact, so a corrupted or
  substituted core now fails the launcher at startup rather than at first
  launch.
- RL-013 wired the catalog and library into the boot path, so those failures
  now happen during boot.

A tampered artifact, a moved trust file, an expired accepted root, or pending
root recovery therefore produces an unbounded three-second restart loop on the
surface that owns the TV. The failure is diagnosable over SSH and each cause is
a fail-closed refusal working as designed, but the console shows a loop rather
than anything actionable.

The clock case specifically was checked and is the least likely of these. The
expiry test rejects a time at or past the root's expiry, so a Raspberry Pi
whose clock is restored too early still passes; only a clock beyond expiry
fails. Ordering the unit after `time-sync.target` is not a fix:
`systemd-time-wait-sync.service` is disabled on the target, so the target never
activates and the ordering would be a no-op, while enabling it would delay boot
on a console with no network.

Safe default taken: nothing changed. Altering the restart policy of the boot
path unattended is exactly the risk RL-013 was scoped to avoid, and both
alternatives are defensible.

Question: when retro material is configured and fails deterministically,
should the session keep retrying forever as it does now, give up after a bounded
number of attempts and leave a diagnosable stopped unit, or start metadata-only
so the console still reaches the shell with the retro lane disabled? The third
option keeps the television alive but silently downgrades what the operator
provisioned, which is the reason it is a question rather than a default.

Decided 2026-08-20: fall back to metadata-only. When retro material fails, the
session starts without it rather than looping, so the television always
reaches the shell.

The downgrade must not be silent. The shell already renders a distinct
"Signed package catalog unavailable" state, and the wrapper records the exact
pre-flight failure to the journal before dropping the retro options. The
mechanism is a `--dry-run` pre-flight, which verifies the signed catalog and
every package artifact digest since RL-007, followed by `exec` either way so
systemd keeps supervising the real launcher.

The restart policy is deliberately unchanged: the owner chose fallback over a
start limit, so a genuinely crashing browser still always comes back.
