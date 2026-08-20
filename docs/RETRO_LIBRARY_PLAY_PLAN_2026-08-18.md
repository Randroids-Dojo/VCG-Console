# Retro library play plan

Status: Lane A and Lane B implemented; provisioning, catalog, and launcher
configuration exercised on target; the browser lane tested on the workstation
only; appliance boot still configures neither

Date: 2026-08-18

Goal: play an operator's own retro collection on the console, on the Raspberry
Pi 5 target, with controller-only navigation.

Nothing here is qualified. No controller, audio, video, save, timing, or
recovery evidence exists on any target, and the session that owns the TV at
boot does not yet configure the catalog or the library at all.

## Where content lives

Staging and deployment run once, from a workstation. The running console has no
dependency on that machine: content, cores, and frontend all live on the
target's own storage.

```text
   ONE TIME ONLY                            RUNNING SYSTEM
┌────────────────────┐                  ┌─────────────────────┐
│  Workstation       │                  │   Raspberry Pi 5    │
│                    │                  │                     │
│  operator's ROM    │ ──── ssh ──────► │  content root       │
│  collection        │   staged once,   │    1,635 objects    │
│                    │   hash-verified  │    1.5 GB           │
└────────────────────┘   on arrival     │                     │
                                        │  + 4 built cores    │
   not part of the                      │  + TV + gamepad     │
   running system                       └─────────────────────┘
```

## What already works

The bottom of the stack is done and was exercised on the target, not inferred.
`vcg-host retroarch --dry-run` was run against the real aarch64 Mesen core and a
real staged ROM. It verified the frontend, core, base-config, and content
digests, then emitted a correct RetroArch command line with separated session,
save, and state namespaces.

```text
        PLAYER PRESSES A
               │
               ▼
┌──────────────────────────────────────────┐
│ TV shell (Svelte in Chromium)            │  exists
│ sends {gameId, profileId} — nothing more │  no lane for 1,635 games
└──────────────────────────────────────────┘  (curated shelf caps at 256)
               │  POST /v1/launches  (127.0.0.1 only)
               ▼
┌──────────────────────────────────────────┐
│ vcg-host launcher                        │  code exists
│ resolves gameId through the signed       │  no catalog document
│ catalog: core, content, expected digests │  no signing keys      ← LANE A
└──────────────────────────────────────────┘
               │  resolved paths + expected hashes
               ▼
┌──────────────────────────────────────────┐
│ retroarch adapter                        │  VERIFIED ON TARGET
│ re-hashes all four artifacts, builds     │  2026-08-18, dry-run
│ argv, separates session/save/state       │
└──────────────────────────────────────────┘
               │  exec
               ▼
┌──────────────────────────────────────────┐
│ RetroArch -L mesen_libretro.so  rom.nes  │  frontend not built
│              ▲ built              ▲ deployed │  (needs apt packages)
└──────────────────────────────────────────┘
```

So the launch adapter accepts managed content today. Everything below is about
reaching that adapter from the shell.

## The two-lane split

The single most important finding is that one lane cannot carry both jobs.

**Curated shelf** — `catalog/*.vcg-game.json` plus `launcher-policy.json`. Caps
at 256 policy entries. Each entry needs hand-written placement, summary, search
terms, and status label. Every addition changes `catalog.generated.ts`, which is
inside the hash-bound production source tree, so it forces a Playwright evidence
regeneration. Search is keyed by title, so two entries sharing a title raise a
Svelte `each_key_duplicate` error at runtime — and regional ROM variants make
duplicate titles near-certain.

That surface is a display case for a small curated set. It is the wrong home for
1,635 operator-owned files, and no amount of raising constants fixes the
per-addition evidence cost or the title-keyed list.

**Library** — `vcg_host::retro_import`. Caps at 100,000 entries, addresses
content by `content-<sha256>`, keeps an append-only generation history, and
already has a complete crash-recoverable native transaction. Its only caller
is the provisioning subcommand in [Lane B1 result](#lane-b1-result--2026-08-18);
nothing reads it back yet.

```text
  CURATED SHELF                          LIBRARY
  (exists today)                         (writable, not readable)
┌───────────────────────────┐        ┌───────────────────────────┐
│ max 256 entries           │        │ max 100,000 entries       │
│ hand-written summary,     │        │ generated from staged     │
│   search terms, position  │        │   content hashes          │
│                           │        │                           │
│ each addition forces a    │        │ adding content touches    │
│   Playwright evidence     │        │   no hash-bound source    │
│   regeneration            │        │   file                    │
│                           │        │                           │
│ list keyed by title,      │        │ keyed by content hash,    │
│   duplicates fail at      │        │   duplicates are          │
│   runtime                 │        │   impossible              │
└───────────────────────────┘        └───────────────────────────┘
         holds                                 holds
  2048, Circuit Shift, VibeBots          the operator's 1,635 files
      a curated display case                    a collection
```

The proposal is therefore:

| Lane | Holds | Mechanism |
| --- | --- | --- |
| Signed packages | RetroArch, Mesen, Snes9x, Genesis Plus GX | signed installed catalog, ~4 packages |
| Library | the operator's ROMs | retro-import library generations |

The shelf keeps showing curated titles. The library becomes a separate
destination that does not touch `catalog.generated.ts` at all, which is what
keeps content changes out of the browser evidence gates.

## Lane A — signed software packages

Nothing here is new mechanism; it is porting an existing tool. What it has to
produce on the target, none of which exists yet:

```text
/var/lib/vcg/
├── packages/                     install root
│   ├── runtimes/retroarch/       retroarch + vcg-base.cfg
│   ├── cores/                    mesen, snes9x, fceumm, genesis-plus-gx
│   └── games/<id>/vcg-game.json
├── installed-catalog.json        signed record of everything above
├── installed-catalog.sig         Ed25519 detached signature bundle
├── trust/
│   ├── anchors.json              out-of-band root public keys
│   ├── accepted-roots/           root history, one directory per generation
│   └── protected-state.json      anti-rollback marker, committed second
└── retro-content/                operator content root
```

`native/vcg-host/src/bin/vcg-development-package.rs` already provisions the full
trust chain: `provision_trust` creates the keys, root document, anchor set, and
accepted-root store; `load_or_create_key` generates raw 32-byte Ed25519 seeds;
`signature_bundle` emits the detached bundle; `write_signed_catalog` builds and
signs the catalog. It is hardcoded to `x86_64-windows`, the `development`
channel, and the 2048 candidate.

Work items:

1. A target-neutral provisioning path that accepts `aarch64-linux` and a
   host-selected channel, rather than refusing to run off Windows.
2. Emit **loose-catalog** material, not package-store material: the launcher
   flags `--catalog`, `--catalog-signature`, `--install-root` plus the four
   update-root arguments.
3. Handle the two-phase bootstrap explicitly. The first `bootstrap` returns
   `ProtectionCommitRequired` and the launcher refuses to start until the
   printed generation and root digest are written back to the protected-state
   file. This is a required step, not an error.
4. Produce a real `vcg-base.cfg`. No production base config exists in the
   repository; it is only ever created inside Rust test fixtures.

Constraints that must be honoured exactly: the catalog `target` field and the
role `target` must both be the compiled `aarch64-linux` pair; root keys and role
keys must be disjoint; signatures are lowercase hex over
`VCG-INSTALLED-CATALOG-V1\0` followed by the exact catalog bytes.

## Lane B — the library

This is the real build. Four pieces, in dependency order.

**B1. Native library provisioning.** A `vcg-host` subcommand that provisions the
`retro/{objects,libraries,audit}` roots and commits a library generation from an
already-staged, already-hashed payload.

This needs an owner decision recorded first. The existing commit path binds every
entry to an import session, a transport, and an entitlement acknowledgement,
because it was designed for USB and paired-LAN acquisition. An operator staging
their own files has none of those. Options: extend the provenance enum with an
honest `operator-provisioned` transport, or build a separate provisioning entry
point that shares the object store but not the session contract. Fabricating a
session ID to satisfy the existing shape is not an option.

**B2. A host API endpoint.** `host_api.rs` currently exposes only status,
packages, launches, and bluetooth. The library needs a paged, bounded, read-only
endpoint returning entry ID, title, system, and size — never paths. Paging is
mandatory at this scale; the existing inventory endpoint returns everything at
once and caps at 1,024.

**B3. A widened launch intent.** `POST /v1/launches` accepts exactly
`{protocolVersion, requestId, gameId, profileId}` under `deny_unknown_fields`,
and the host resolves all paths itself. A library launch must name which ROM.
The safe shape is one added field carrying a `content-<sha256>` entry ID that
the host resolves against its own library generation — never a path, never a
core, never an argument. The browser gains no new authority: it selects from a
set the host already published.

**B4. A library UI lane.** A new destination, not a new shelf row. It needs
system-then-title browsing, virtualized or paged rendering, a non-title list key
(the entry ID), and controller-only navigation meeting the TV contract floors in
`docs/TV_COMPATIBILITY_CONTRACT.md`. Keeping it fed by the host endpoint rather
than a generated module is what keeps it out of the hash-bound source tree.

## Sequencing

Lane A is independent and lands first; it is also what makes the curated
`retro-2048` candidate launchable. Lane B depends on the owner decision in B1.
B2 and B4 can proceed in parallel once B1 fixes the record shape. B3 is a
contract change and should be reviewed on its own.

A useful intermediate exists: with Lane A done, a single hand-authored
managed-content package proves the whole chain end to end on hardware before any
library work begins. That is worth doing first as a vertical slice.

## Lane A result — 2026-08-18

Implemented and exercised on the Raspberry Pi 5 target.

`native/vcg-host/src/bin/vcg-retro-provision.rs` provisions the trust material
and signs a loose catalog for a target named as an argument. It handles the
two-phase bootstrap in one run, is idempotent, and fails closed on a missing
artifact, an unsafe relative path, or managed content without a content root.

Observed on target:

```text
vcg-retro-provision:root    generation=1 protected-state=committed
vcg-retro-provision:catalog generation=1 packages=1
                            target=aarch64-linux channel=development
vcg-host launcher --dry-run
  launcher:catalog source=loose-catalog generation=1 target=aarch64-linux
  launcher:profiles count=1
```

Artifact digests from the native aarch64 builds:

| Artifact | SHA-256 |
| --- | --- |
| retroarch 1.22.2 | `dcba0282d627ac90538d789b9471bcd0cdd7de3d9b1dea4e2d5a2f8347b14f6a` |
| mesen_libretro.so | `184ac03e62a01bf51f888c65daa7ce5bde253887a607681aef9a9a0a5c16449b` |
| snes9x_libretro.so | `1341d712c577a4d8c16fe869b33412392fac91a1c7fe8752b6ba04f881ccc0d7` |

The slice package is `nes-balloon-fight`, `qualification: development` bound to
a `compatibilityStatus: "unverified"` manifest. Nothing about the title has
controller, audio, video, save, or timing evidence, so the qualified pairing
would have been a false claim. The development channel is the accepted way to
express that.

RetroArch was also run directly against the core and content, outside
`vcg-host`, as a core smoke test. Mesen loaded the ROM, parsed its iNES header
as 16 KB PRG and 8 KB CHR, reported 256x240 at 60.10 Hz, ran 400 and 600 frame
runs to a zero exit, and produced a correct 256x240 frame capture. That
establishes the core and content work together on aarch64. It is not a
qualification result: it used null video, audio, and input drivers, so nothing
about display, sound, controllers, or frame pacing was exercised.

### Observation worth recording

The launcher does not hash package artifacts at catalog load. `verify_all_artifacts`
is a staging and promotion call, not a load call, so a tampered core still
passes `vcg-host launcher --dry-run`; the digest is enforced when a game is
resolved and launched. Provisioning verifies at write time, which narrows but
does not close the window. This matches the substitution caveat already recorded
in [the installed-catalog contract](INSTALLED_PACKAGE_CATALOG.md).

## Lane B1 result — 2026-08-18

Implemented in `vcg_host::retro_import`, per decision 1 below. Not yet run on
the target.

`vcg-host retro-provision [--dry-run] --writable-root … --payload …` commits a
staged operator payload as one library generation. It provisions the
`retro/{objects,libraries,audit}` roots, the operation lock, and generation
one; recomputes every object's SHA-256 rather than trusting the staged
manifest; derives each object name itself and rejects a manifest whose name
differs; and refuses a hash already installed under another system.

Provenance became a closed tagged union rather than gaining nullable fields:
a `usb` or `paired-lan` entry carries session, entitlement, and import time,
and an `operator-provisioned` entry is exactly `{"transport":
"operator-provisioned"}`. Supplying a session ID beside that transport is
rejected rather than stripped, the terminal-intent vocabulary keeps only the
two session transports, and every existing intent rejection still rejects.

No timestamp is recorded. The console has no trusted clock claim to make, the
append-only generation history already records order, and the omission is what
makes the transaction deterministic — so an interrupted run is re-run rather
than recovered, with published objects adopted after rehashing and an
identical audit record and generation recognized rather than rewritten.

Exercised locally against a payload produced by the real
`scripts/pi/stage-retro-content.mjs`:

```text
retro-provision:roots created=true
retro-provision:payload system=nes entries=2 archive-extracted=0
retro-provision:verified copied=2 installed=0 bytes=42
retro-provision:committed id=rop-fa68e49c7cd13275dc69b85e2bf62eff generation=2
                          entries=2 already-installed=0
                          transport=operator-provisioned
```

The audit record's `stagedManifestSha256` and `librarySha256` were confirmed
against `sha256sum` of the manifest and the published generation document.

### Closed after B1

`schemas/retro-installed-library.schema.json` and the TypeScript coordinator's
library validation now describe the same transport-tagged union the host
records, so a generation holding operator-provisioned entries validates
against both. The read endpoint and launch intent remain B2 and B3 work.

## Lane B result — 2026-08-18

The library is writable, readable, and launch-admissible, and the whole chain
was exercised on the Raspberry Pi 5 target.

`vcg-host retro-provision` committed the operator's real collection in two
runs, one per system, recomputing every digest rather than trusting the staged
manifest:

```text
retro-provision:payload   system=nes  entries=655 archive-extracted=0
retro-provision:verified  copied=655  bytes=144296488
retro-provision:committed generation=2 transport=operator-provisioned

retro-provision:payload   system=snes entries=980 archive-extracted=980
retro-provision:verified  copied=980  bytes=1424576000
retro-provision:committed generation=3 transport=operator-provisioned
```

655 entries took 13.5 s and 980 took 36.6 s on target. A signed catalog was
then published with a `content.mode: "library"` package, and the launcher
loaded both together:

```text
launcher:bluetooth-controller-pairing configured
launcher:catalog source=loose-catalog generation=2 target=aarch64-linux
launcher:profiles count=1
launcher:retro-library generation=3 entries=1635
```

Counts only: the dry-run report discloses no writable root, object path, entry
ID, or title. Bluetooth pairing and the library are served by one launcher
process, which matters because a retro launch now requires a connected
controller.

The shell gained a library destination fed by that endpoint rather than by
`catalog.generated.ts`, so adding content changes no hash-bound source file.
It renders a measured window sized to the safe content box — five rows at
720p, seven at 1080p, nine at 4K — keyed by entry ID rather than title,
because the library is exactly the set where titles repeat. It is deliberately
absent from the universal search overlay for the same reason.

A libretro launch is now refused while no controller is connected, before any
request reaches the host. That is a shell usability gate, not a security
boundary: the host cannot enforce it, because `vcg_host::input` declares
`ShellAction` but no backend reads a physical device.

Still workstation-only: the library read endpoint and the `entryId` launch
path have unit, integration, and browser coverage but have not been exercised
over loopback from the shell on target, because that needs a display session.

### Evidence regeneration

The browser evidence was regenerated in the documented order and all six
validators pass. Two consequences are worth recording:

- The search evidence generator drives the same launch the controller gate now
  refuses, so it needs a synthetic controller present from the first
  observation. Only the one state that uses the retro adapter was changed.
- The OCRA font evidence scans every file under the production source roots,
  including tests. New non-ASCII characters there — deliberate fixtures for
  rejecting unsafe display characters — appeared as uncovered production code
  points. They are now written as escape sequences, and two em dashes in
  comments became ASCII, so production source carries no character the OCRA
  font does not cover.

## Blocked on

**Appliance boot configures none of this.** The session unit starts the launcher
with a browser, Bluetooth, cursor-nudge, profile directory, and URL, and nothing
else. No catalog, no trust material, no library. Everything both lanes produced
is reachable only by direct command-line invocation, not from the session that
owns the TV at boot. Wiring it needs a trusted-time snapshot the unit cannot
compute inline, and a host-owned location for the trust material. Recorded as
RL-013 with the two design problems stated.

**Running under the real display path.** Every observation so far used dry-run
or null drivers. A session under Cage on the physical target, with a controller
and a TV, remains untested and is where the qualification gates begin. Lane B1 has
not been run on the target at all.

## Explicitly not addressed

BIOS handling is inert: the signed catalog has no BIOS record and the adapter
never places or verifies one, so FDS titles cannot work regardless of this plan.
The public manifest's content digest is never compared against the signed
catalog's. Neither is a blocker for cartridge ROMs, and neither is fixed here.

Nothing in this plan qualifies a core, a title, controller mapping, audio or
video behaviour, save durability, or frame pacing. Those remain the subject of
[the supervised frontend campaign](SUPERVISED_LIBRETRO_FRONTEND_QUALIFICATION_CAMPAIGN_2026-07-26.md).

## Decisions taken 2026-08-18

1. **B1 provenance — extend the transport enum.** Library entries gain an
   honest `operator-provisioned` transport rather than a second provisioning
   path. One library, one crash-recoverable transaction. This changes an
   audited record format, so the closed-vocabulary tests must be extended
   deliberately rather than relaxed, and the entitlement field's meaning at
   provision time must be restated in
   [the import contract](RETRO_IMPORT_CONTRACT.md).
2. **B3 launch intent — one added field, decided after the slice.** The slice
   proved host-side resolution, so `POST /v1/launches` gains one optional
   `entryId` carrying a `content-<sha256>` that the host resolves against its
   own current library generation. The browser still names no path, core, or
   argument. The field must be rejected for packages that are not library
   launches.
3. **Controller — launch gate only.** A libretro package will not start when no
   controller is connected, because the appliance session has no keyboard and a
   player would otherwise have nothing to play or escape with. Reserved
   Home/Back stays unimplemented: see the note below.
4. **Build order — Lane A plus a one-title slice.** See below.

### Reserved Home and Back remain unowned

The base configuration binds Start+Select to RetroArch's own menu because,
with no keyboard and no system-owned Home, a running core would otherwise have
no controller-reachable exit. That is an interim measure and it does not
satisfy [the reserved Home invariant](RESERVED_HOME_ACTION_CAMPAIGN_2026-07-26.md):
the frontend receives the combo, the surface it opens is the raw frontend menu,
and a hung core stops processing input and takes the escape path with it.

Closing it needs a privileged input router above the frontend. The contract
already exists — `vcg_host::input::ShellAction` declares `Home`, `Back`, and
`Pause` — but no backend reads a physical device, and a router will have to
handle a frontend taking an exclusive `EVIOCGRAB` on the event device.

## Build order

Lane A, then one hand-authored qualified managed-content package, then stop and
re-evaluate. Concretely:

1. A provisioning binary that writes trust material and a signed loose catalog
   for a named target. Rust, so it reuses `UpdateRootStore::bootstrap` and the
   real signing-message helpers instead of reimplementing their formats. It
   builds and runs natively on the target.
2. A production `vcg-base.cfg`.
3. One installed-root `vcg-game.json` for a real NES title, bound by digest
   from the signed catalog.
4. Verification with `vcg-host launcher --dry-run` on the target.

The slice deliberately does **not** add a `catalog/*.vcg-game.json` entry. That
public surface additionally requires a `launcher-policy.json` entry and a full
Playwright evidence regeneration, and it is not needed to prove host-side
resolution, digest verification, and the adapter. Surfacing a title in the shell
is a separate, later step.

## Still open

Open choices are recorded as RL-001 through RL-008 in
[the owner questions](OWNER_QUESTIONS_RETRO_LIBRARY_2026-08-18.md). Each states
the safe default taken in the meantime, so none of them blocks work already
done.

## Reserved input router — design research, 2026-08-19

Four facts were established before implementation, because they decide the
design rather than being details of it.

**The frontend does not grab the device.** RetroArch 1.22.2's `udev_input.c`
and `udev_joypad.c` contain no `EVIOCGRAB` call. Linux evdev delivers events to
every open reader when no process holds an exclusive grab, so a host-side
reader keeps receiving controller input while a game runs. The grab hazard that
motivated this research does not occur with the selected frontend, and any
future frontend change must be re-checked against it.

**Reading needs no unsafe code.** An evdev event is a fixed-layout record read
from a character device, and device identity and capabilities are readable from
sysfs. Neither requires an ioctl, so the reader can live inside `vcg-host`
without touching its `unsafe_code = "forbid"` boundary.

**Interception would.** Preventing the game from seeing the reserved edge at
all requires an exclusive grab plus re-emitting the remaining events through a
virtual device, which is ioctl work. The repository already has the pattern for
that: `vcg-cursor-nudge` isolates its `/dev/uinput` FFI in a separate
single-purpose crate that `vcg-host` invokes as a subprocess, precisely so the
host keeps its trust boundary.

**The console account can already read the devices.** It is in the `input`
group, which the appliance installer adds.

### What this scopes

An observing router delivers the property that matters most: the host owns Home
and Back, reads them directly from the device, and can always terminate the
child and return to the shell — including when the core has hung and is no
longer processing input at all. That is exactly the failure the current
frontend-handled combo cannot survive.

It does not deliver the whole
[reserved Home invariant](RESERVED_HOME_ACTION_CAMPAIGN_2026-07-26.md). Without
interception the game also observes the same button events. Removing the
frontend menu binding means the frontend does nothing with them, but a game
could still act on them, so the invariant's "never receives Home" clause stays
open and belongs to a later interception design.

Neither this nor that later work qualifies I-091, which requires physical
multi-controller evidence on both reference targets.
