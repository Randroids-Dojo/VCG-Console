# Epoch supervised top-level evidence

Evidence date: 2026-07-24

Status: I-090 framing-mode proof complete; catalog playability and target
recovery controls remain unverified.

## Result

One live Windows x64 run verified that Epoch can load through the guarded
supervised top-level browser lane without weakening its deployment headers.
Installed Chrome `150.0.7871.182` navigated to the exact reviewed entrypoint
`https://epoch-theta.vercel.app/`, retained that final URL, reported title
`Epoch` and `document.readyState=complete`, observed no navigation-policy
violation, exited with code 0, and removed the newly created ephemeral profile.

The initial response was HTTP 200 with:

```text
Content-Type: text/html; charset=utf-8
Content-Security-Policy: frame-ancestors 'self' https://randroid.dev https://www.randroid.dev
X-Frame-Options: ALLOW-FROM https://randroid.dev
```

The CSP still excludes every VCG console origin. This result therefore
validates the already selected top-level mode under D-014 and D-055; it does
not make iframe embedding compatible and does not require an Epoch header
change for top-level navigation.

## Evidence method

The bounded live generator:

1. fetches the exact HTTPS URL with manual redirect handling and records the
   reviewed response fields;
2. derives a closed policy containing only the Epoch entrypoint, origin, and
   health URL;
3. creates a branded temporary profile and starts Chrome headlessly through
   the same blank-target CDP supervisor used by the hosted-browser lane;
4. attaches and arms the origin/navigation guard before navigating;
5. waits for the guarded initial load and a bounded `interactive` or
   `complete` document state;
6. obtains the exact browser product from `Browser.getVersion`;
7. closes the owned browser process and verifies that the profile is removed;
   and
8. writes a strict 64 KiB-bounded artifact that binds the exact supervisor,
   generator, and validator source hashes.

The first implementation exposed a real load-boundary race: the startup
`about:blank` load could satisfy the original reusable promise before the
reviewed navigation. The supervisor now creates a fresh load promise
immediately before every `Page.navigate`. The final evidence therefore binds
the load signal to the Epoch navigation rather than the blank startup target.

The later integrated gate exposed a separate Windows startup race:
`DevToolsActivePort` existed but was transiently locked with `EBUSY`. The
supervisor now retries only that lock and ordinary pre-creation `ENOENT` within
the unchanged bounded deadline. A deterministic unit case and the three real
Chrome containment probes pass. The live Epoch artifact was reproduced on the
same evidence date so its provenance binds the exact corrected supervisor;
its narrow HTTP/load/cleanup facts did not change.

## Recorded artifact

The authoritative record is
`benchmarks/hosted-browser/epoch-top-level-windows-v1.json`. Its disposition
is deliberately narrow:

- console-origin framing supported: no;
- supervised top-level load verified: yes;
- header change required for top-level mode: no;
- catalog playability verified: no;
- controller exit verified: no; and
- reserved Home/Back verified: no.

The summary records exactly one HTTP success and one top-level load, with zero
policy violations, play tests, controller tests, or participants. Eight
mutation tests reject altered header/origin policy, fabricated framing or
playability claims, weakened process/profile facts, undeclared play,
controller, participant, or recovery evidence, stale source provenance, and
unknown fields.

Run the offline gate:

```sh
pnpm validate:epoch-top-level
```

Reproduce the live artifact on its evidence date with:

```sh
pnpm exec tsx scripts/generate-epoch-top-level-evidence.mjs
```

The generator refuses a later UTC date. New current-network or browser
evidence must use a versioned successor artifact and a newly reviewed claim
boundary rather than silently rewriting this dated record.

## Claim boundary

This is one Windows development-host observation. A loaded document is not a
ready or playable game. The run did not test controller input, audio,
fullscreen, service workers, storage, authentication, keyboard-free
navigation, offline or degraded-network behavior, target performance, or
catalog qualification.

It also did not test compositor-owned Home, Back, Pause, or forced exit under
pointer lock, full screen, focus capture, renderer hang, crash, or child
process failure. Q-046 and the narrowed Q-048 remain open for that target-Linux
recovery matrix. Q-049 remains open for the 26-game controller-only hands-on
matrix. I-180 remains active until the native host, compositor, service
manager, browser/version policy, and ARM64/x86-64 Linux lanes are qualified.
