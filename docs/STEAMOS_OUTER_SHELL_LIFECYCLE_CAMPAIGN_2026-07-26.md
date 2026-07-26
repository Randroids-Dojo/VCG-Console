# SteamOS outer-shell lifecycle campaign

Date: 2026-07-26
Status: strict blocked I-171 plan; no target operation, route selection, video,
or qualification result
Scope: I-171, D-027, D-030, D-106, D-118, D-119, Q-092

## Outcome of this tranche

This tranche converts I-171 from a short video request into a source-bound,
machine-checked campaign. It does not operate SteamOS hardware, configure an
account, install VCG, establish an auto-launch method, inject a fault, apply an
update, request shutdown, record a screen, select a route, approve branding, or
qualify the Steam Machine.

The canonical artifact is
`benchmarks/steamos-shell/steamos-outer-shell-lifecycle-plan-v1.json`. The
validator and adversarial tests are
`scripts/validate-steamos-outer-shell-lifecycle-plan.mjs` and
`scripts/validate-steamos-outer-shell-lifecycle-plan.test.mjs`.

## Current official platform boundary

The plan freezes only facts present in current Valve material checked on
2026-07-26:

- Valve's
  [Steam Machine feature guide](https://help.steampowered.com/en/faqs/view/1180-0BA6-4A75-B7CA)
  says stock first startup guides controller connection, networking, and Steam
  login; Gaming Mode remains the visible shell; Desktop Mode is reached from
  the Steam power menu; and SteamOS and hardware updates remain in Steam
  settings.
- Valve's
  [non-Steam shortcut guide](https://help.steampowered.com/en/faqs/view/4B8B-9697-2338-40EC)
  describes a client shortcut. It does not make Steam deliver updates for the
  application and does not make the shortcut proof of Steam ownership.
- Valve's
  [SteamOS install and repair guide](https://help.steampowered.com/en/faqs/view/65B4-2AA3-5F37-4227)
  keeps reimage, repair, and recovery as separate platform-owned operations.
  Reimage wipes user information, games, applications, and operating systems;
  repair only attempts to preserve games and personal content.
- Valve's
  [Steam Overlay documentation](https://partner.steamgames.com/doc/features/overlay)
  describes Steam UI layered over a Steam-launched rendered application and an
  activation callback a game may use to pause or resume. It also says ordinary
  browser rendering is not a supported overlay model without a native wrapper.

These records establish supported surfaces and risks. They do not establish a
supported VCG auto-launch path, accountless Steam Machine setup, overlay
compatibility for the current browser launcher, or permission to modify the
stock session.

## Ownership contract

The campaign distinguishes four visible owners:

1. Valve owns boot, initial setup, Gaming Mode, Desktop Mode entry, Steam
   Overlay, SteamOS update, SteamOS repair/reimage, and the final platform power
   handoff.
2. VCG may own the surface of the launched VCG application: launcher, loading,
   local failure, recovery, and return flows.
3. A launched game owns its content surface only while the host grants it
   focus; it never owns Home, platform overlay, update, or shutdown authority.
4. The trusted native host owns bounded game containment, health, launch
   admission, quiescence, and calls to a separately qualified platform adapter.

VCG must not visually impersonate Steam setup, Overlay, update, recovery, or
shutdown. The stock outer shell must remain truthfully visible wherever it owns
the operation. A full-screen VCG application is not evidence that VCG owns the
platform shell.

## Route candidates

The plan compares three routes without selecting one:

| Route | Supported boundary | What it may prove |
| --- | --- | --- |
| `stock-gaming-mode-non-steam-shortcut` | Manual selection from Valve Gaming Mode; shortcut only | Whether the current package can present a coherent VCG lifecycle after an ordinary Steam launch |
| `stock-desktop-mode-installed-application` | Explicit switch to Desktop Mode, desktop application launch, and supported return to Gaming Mode | Development and recovery usability; never automatic living-room entry by itself |
| `candidate-supported-automatic-vcg-entry` | No supported method established | Only a future exact, documented, update-safe platform method or an explicit incompatible result |

Manual launch cannot rescue a failed automatic-entry requirement. Desktop Mode
cannot rescue a Gaming Mode product route. A proxy cannot qualify the exact
Steam Machine. Steam login cannot rescue the independent accountless core
requirement. Unsupported session, filesystem, client-database, or update-image
mutation cannot qualify any route.

## Targets

Two rows are retained:

- `exact-steam-machine` is required for I-171 qualification; and
- `supported-amd-steamos-proxy` may exercise the harness but remains
  development-only.

Neither row has an exact hardware, SteamOS, Steam client, firmware, display,
controller, package, route, or result manifest. Neither has operation authority.

## Eight required lifecycle scenes

Every target-route pair must exercise the following ordered evidence classes:

1. cold boot to the stock outer shell or a truthful blocking setup screen;
2. the route-specific entry into a visibly branded, focused, controller-usable
   VCG home;
3. branded local-game loading through observable phases to interaction or a
   bounded truthful failure;
4. normal game exit, descendant cleanup, input-epoch reset, and deterministic
   VCG focus restoration;
5. contained game crash or hang, truthful recovery, and a fresh retry/details/
   exit path;
6. platform-owned Steam Overlay open/close, pause disposition, focus recovery,
   and no stuck input;
7. stock SteamOS update, reboot, version transition, package/route integrity,
   and truthful rollback or repair boundary; and
8. confirmed controller shutdown, launch-admission closure, complete service
   quiescence, one-shot platform handoff, and externally observed power state.

Each scene freezes a start event, an end event, visible state evidence, and at
least four independent oracles. First pixels, animations, process start, or a
successful video alone do not satisfy readiness, focus, containment, update, or
power truth.

## Matrix and sample size

The full pre-registered matrix is:

- 2 target rows;
- 3 route candidates;
- 8 lifecycle scenes;
- 48 target-route-scene cells;
- 20 valid cycles per cell; and
- 960 valid cycles total.

Every cycle requires a structured event ledger. Every cell requires at least
one representative sanitized video. Failed, invalid, stopped, retried, adverse,
and worst-case cycles remain visible. No target, route, scene, cycle, average,
or proxy may rescue a product failure.

## Timing and visible-state gates

The campaign inherits the frozen D-106 ceilings:

- visible branded response within 250 ms of a deliberate VCG action;
- controller-usable cold boot within 60 seconds;
- local game interaction within 15 seconds;
- hosted interaction or truthful phase progress within 30 seconds; and
- controller-usable warm resume within 5 seconds.

VCG loading must distinguish `preparing`, `checking-dependency`, `starting`,
`waiting-for-readiness`, `recovering`, and `failed`. The controller-accessible
escape set is Back/cancel, retry, details, and exit. A fake animation cannot
satisfy a timer. The event ledger must identify the actual phase owner and the
oracle that established the end event.

Crash/hang recovery, update survival, shutdown quiescence, and additional
accessibility/comprehension thresholds remain null until their protocols and
reviewers are frozen. The campaign may not tune those gates after observing
results.

## Controller and overlay boundary

The I-169 semantic-action contract remains authoritative:

- Steam/Home and platform overlay remain platform-owned;
- VCG or a game cannot receive or swallow the reserved platform action;
- Overlay cannot be the sole VCG recovery mechanism;
- closing Overlay must restore exactly one focus owner with a fresh input epoch;
- no held or replayed action may cross the transition; and
- an overlay callback is not proof that the browser launcher renders correctly
  beneath Overlay.

The current launcher is browser-based. The campaign therefore blocks overlay
qualification until an exact native wrapper/rendering route, or a documented
no-overlay disposition with an independent recovery path, is selected and
tested.

## Update and power boundary

The VCG package and route must survive stock SteamOS and Steam client updates
without disabling or masking them. A non-Steam shortcut is not an update
channel. I-166 must separately provide the signed update-safe package result.

Shutdown is not a page navigation or subprocess exit. The native coordinator
must first close launch admission; obtain authenticated, operation-bound
quiescence from game, tracker, camera, input, writes, and update state; and then
call one selected SteamOS platform adapter. A terminal or ambiguous adapter
result stays a visible failure. Electrical power loss is never reported as a
clean shutdown.

## Evidence and privacy

The requested videos create a distinct disclosure risk because stock Steam UI
may show account names, avatars, friends, chat, libraries, notifications, QR
codes, or recovery information. Screen recording remains unauthorized until an
opaque test identity, capture zone, sanitization, review, retention, deletion,
and incident protocol is approved.

Allowed structured evidence is limited to opaque identifiers, monotonic
timestamps, durations, closed state/result categories, software versions,
configuration digests, and detached artifact digests. Prohibited evidence
includes Steam identity, credentials, cookies, account or network entry,
community content, filesystem paths, process arguments, environment values,
free-text notes, raw camera/audio/body material, and deleted adverse evidence.
Network payload capture and raw-media retention are disallowed.

## Relationship to adjacent investigations

- I-166 owns update-safe SteamOS content/package behavior.
- I-169 owns optional Steam Input semantic actions and reserved controls.
- I-170 owns accountless core operation; I-171 cannot weaken or close it.
- I-180 owns the production hosted-browser wrapper and compositor boundary.
- I-023 owns cross-tier boot/resume/launch timing.
- I-029 owns privileged idle, restart, shutdown, and recovery sequencing.
- I-209 owns final native-host target integration and qualification.

An I-171 pass would prove only the selected visible SteamOS integration route on
the exact tested tuple. It would not make Steam Machine the primary reference,
qualify Steam Input generally, prove accountless operation, approve public
branding, qualify another SteamOS device, or authorize publication.

## Honest stopping point

The plan is intentionally blocked on 16 explicit items mirrored in
`OWNER_QUESTIONS_STEAMOS_OUTER_SHELL_2026-07-26.md`. Until they are resolved,
the only valid result is `null`. The validator rejects invented target facts,
official auto-launch claims, proxy promotion, route selection, shell ownership,
identity capture, weakened timing or no-rescue gates, hidden failed cycles, and
premature qualification.
