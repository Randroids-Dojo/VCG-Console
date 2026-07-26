# Hosted browser supervision prototype

Last updated: 2026-07-24

Status: bounded Windows desk prototype implemented; I-180 remains active
pending native-host, compositor, service-manager, and target-Linux evidence.

## Scope

`pnpm supervise:game` now launches a `remote-web` manifest through an actively
supervised top-level Chrome app window. The old
`VCG_ALLOW_UNCONTAINED_BROWSER=1` development exception no longer exists.

This is the first executable post-launch navigation boundary. It is separate
from the launcher's intentionally unsupervised browser preview and from the
iframe policies in `BROWSER_POLICY_BOUNDARY.md`.

The prototype still runs as a Node developer command. It is not yet privileged
Rust-host authority, a kiosk compositor, or an ordinary x86-64/ARM64 Linux
qualification result.

## Closed launch policy

The command parses the public game manifest, then derives a smaller runtime
policy containing only:

- one safe game ID;
- one credential-free HTTPS entrypoint;
- one to eight unique credential-free exact HTTPS origins;
- one health-check URL within that origin set; and
- one bounded 1-to-120-second initial-load deadline.

Only `remote-web` plus an HTTP health-check declaration is accepted. Origins
cannot contain a path, trailing slash, query, fragment, wildcard, credential,
HTTP downgrade, or duplicate. The entrypoint and health check must remain
within the exact origin set.

The pre-launch health check uses manual redirect handling. It follows at most
five redirects and validates each next HTTPS origin before issuing that
request. A redirect to an undeclared origin therefore fails without sending a
request to the foreign destination. A successful HTTP response proves only
reachability, not browser or game readiness.

Every supervised game must separately set the fixed document marker
`html[data-vcg-ready="1"]`. The marker name and accepted value are host code,
not manifest-selected policy. HTTP health and document load cannot substitute
for it.

## Ephemeral process and profile

Every live attempt creates a fresh operating-system temporary profile. Chrome
starts at one blank app target with:

- a random loopback DevTools port;
- no first-run/default-browser flow;
- sync, component updates, default apps, translation, media routing, and
  background networking disabled where the fixed Chrome flags provide that
  behavior; and
- normal browser sandbox and web-security controls still enabled.

The entrypoint is not placed on the process command line. The supervisor first
connects to DevTools, requires exactly one blank `about:` or Chrome new-tab
page, attaches to it, enables page events, disables downloads, resets browser
permission grants, and explicitly denies camera, microphone, geolocation,
MIDI, and notifications for every allowed origin. Only then does it send the
reviewed entrypoint through `Page.navigate`. Navigation, the first permitted
document load, and explicit readiness share one monotonic launch deadline;
each phase receives only the time left by the prior phase. After the load
event, the host polls one fixed boolean DOM expression until the exact marker
appears. Page code cannot extend or reset the host deadline. Absence returns
stable `EXPLICIT_READY_TIMEOUT` and stops the owned browser rather than
falling back to load success. While attaching, the supervisor retries only an
absent `DevToolsActivePort` file or a transient Windows `EBUSY` lock on that
file. Oversized/malformed endpoint bytes, other filesystem errors, browser
exit, and deadline exhaustion still fail closed.

On normal close, abort, failure, or violation, cleanup first requests
`Browser.close`. Windows development fallback terminates the exact spawned PID
tree; POSIX launch uses a separate process group and signals that group. The
temporary browser profile is recursively removed only after the owned browser
process exits. Cleanup accepts only a branded direct child of the operating
system temporary directory and rejects links and non-directories before
removal. This does not replace a production service-manager/cgroup boundary or
eliminate a same-account path-swap race.

## Active containment

After navigation is armed, the supervisor observes both target URL changes and
top-frame navigation events. Every top-level URL must:

- use HTTPS;
- contain no username or password; and
- match one declared origin exactly.

Paths, queries, and fragments may change within an allowed origin. A reviewed
second origin may support an in-window login redirect. HTTP, `file:`, `data:`,
`chrome:`, custom schemes, undeclared subdomains, malformed URLs, and foreign
origins terminate the entire browser attempt.

Any second page target is treated as a popup attempt and terminates the
attempt. A download event or renderer crash also terminates it. The first
violation is retained as the terminal stable code; later events cannot replace
it.

An allowed document `load` event is reported as `document-loaded`, never
`ready`. Only the exact marker advances the host status to `ready`. The marker
means the page claims its initial reviewed game surface and handlers are
ready; it does not prove compositor focus, responsiveness after the claim,
playability, login, offline operation, or health.

## Post-ready liveness candidate

After the exact readiness marker, the live runner starts a fixed v1
challenge/acknowledgement loop. The wrapper contract is deliberately not
manifest-selected:

```js
globalThis.vcgHostedLifecycleV1 = Object.freeze({
  async acknowledgeChallenge(challenge) {
    // Respond only after the top-level game task loop handles this call.
    return challenge;
  },
});
```

The supervisor creates a fresh random 128-bit lowercase-hex challenge for each
probe, invokes only the top-level page through CDP with `userGesture: false`,
awaits the wrapper result, and accepts only the exact current challenge. It
does not accept a boolean, stale value, wrapper-selected token, DOM attribute,
iframe message, network response, service-worker signal, or document-load
event.

The immutable desk policy challenges every 1,000 ms, allows 2,000 ms for an
acknowledgement, and terminates after two consecutive unavailable probes. A
successful exact acknowledgement resets only the consecutive-miss count. It
does not reset another deadline or authorize a navigation, permission, input,
save, or launch operation. The supervisor distinguishes:

- `POST_READY_CONTRACT_MISSING` before any acknowledgement;
- `POST_READY_CONTRACT_LOST` after at least one acknowledgement;
- `POST_READY_ACK_INVALID` for a wrong, malformed, or throwing producer; and
- `POST_READY_HEARTBEAT_TIMEOUT` for two consecutive timeout/transport
  failures.

Only counts cross the result boundary. Challenge values and page exceptions do
not. Every terminal liveness result stops the owned browser and removes the
temporary profile. There is no automatic restart and no page-controlled
extension of ownership.

This is a bounded candidate, not a production timing or qualification claim.
Any script in the allowed top-level page can imitate the global function until
admission binds an exact reviewed wrapper. A challenge acknowledgement proves
only that this JavaScript call returned the current value; it does not prove
correct rendering, controller focus, audio/video progress, network/login
health, compositor containment, or that a native service scope terminated all
descendants. The stable result is intended for a future console-owned recovery
overlay rather than letting page JavaScript choose recovery.

## Automated evidence

Twenty-six focused cases cover:

- strict policy derivation and immutability;
- runtime, ID, origin, credential, duplicate, bound, timeout, entrypoint, and
  health authority rejection;
- bounded retry of one transiently locked DevTools endpoint file;
- allowed same-origin and reviewed multi-origin navigation;
- malformed, downgraded, credentialed, subdomain, foreign, `file:`, `data:`,
  and `chrome:` refusal;
- popup, download, and renderer-crash terminal behavior;
- first-violation retention and guard lifecycle;
- invalid/nonboolean readiness producers, exact polling, success only after an
  explicit positive observation, and bounded no-marker timeout with no
  document-load fallback;
- immutable post-ready timing bounds, exact fresh challenge echoes, missing
  versus lost contracts, invalid/replayed/malformed acknowledgement refusal,
  timeout counting, and successful-ack miss reset;
- redirect-before-request enforcement, redirect bounds, missing locations, and
  unhealthy responses; and
- fixed process arguments without `--no-sandbox` or
  `--disable-web-security`; and
- destructive-profile lexical scope, including refusal of the temporary root,
  unrelated names, short names, and nested paths.

The final test launches installed Chrome headlessly four times through real
random DevTools endpoints and separate ephemeral profiles. Three runs arm the
production guard, inject a forbidden `data:` top-level navigation, popup, and
download, observe `NAVIGATION_ORIGIN_DENIED`, `POPUP_ATTEMPT`, and
`DOWNLOAD_ATTEMPT`, and terminate. The fourth installs a synthetic exact-echo
wrapper in the sole blank top-level target and proves the production CDP
expression returns one fixed 128-bit challenge exactly. Every run closes the
owned browser with exit code 0 and removes its profile directory. The
2026-07-24 Windows evidence used Chrome 150.0.7871.182.

Run:

```sh
pnpm exec tsx --test scripts/hosted-browser-supervisor.test.ts
pnpm supervise:game catalog/determined.vcg-game.json --dry-run
```

The real-Chrome case skips only when neither `VCG_CHROME_PATH` nor a known
installed Chrome/Chromium path exists. A target qualification run must require
the exact selected browser rather than accepting that skip.

## Epoch top-level evidence

`benchmarks/hosted-browser/epoch-top-level-windows-v1.json` preserves the
original 2026-07-24 Windows x64 run.
`benchmarks/hosted-browser/epoch-top-level-windows-v2.json` records the
2026-07-25 successor against the privacy-hardened health-check request
boundary.
`benchmarks/hosted-browser/epoch-top-level-windows-v3.json` is the
2026-07-25 successor after the live runner gained explicit readiness.
`benchmarks/hosted-browser/epoch-top-level-windows-v4.json` is the current
2026-07-25 successor after the live runner gained post-ready challenge/ack
monitoring. All four observations target
`https://epoch-theta.vercel.app/`. The response returned HTTP 200 and retained:

- `Content-Security-Policy: frame-ancestors 'self' https://randroid.dev https://www.randroid.dev`;
- `X-Frame-Options: ALLOW-FROM https://randroid.dev`; and
- `Content-Type: text/html; charset=utf-8`.

Those headers do not authorize a VCG console origin to frame Epoch. The probe
therefore used the selected top-level path rather than weakening or bypassing
the deployment policy. Chrome `150.0.7871.182` loaded the exact allowlisted
entrypoint as the sole guarded page, reported title `Epoch` and
`document.readyState=complete`, observed no policy violation, exited with code
0, and removed the fresh profile.

The v4 load-only probe reuses the production policy derivation, blank-page
attachment, navigation guard, browser shutdown, and profile cleanup but
deliberately does not invoke the live runner's explicit marker or post-ready
challenge/ack gates. Its result contains only final URL, title, document ready
state, browser product, exit status, and cleanup state. It does not inspect
game content or confer readiness or liveness authority.

Each artifact binds the exact supervisor, live generator, and strict validator
SHA-256 values. The active validator targets v3. Eight mutation tests reject
framing authorization, altered
headers or origins, weakened load/cleanup facts, fabricated play/controller/
participant evidence, playability promotion, stale provenance, and unknown
fields. Routine tests validate the recorded artifact; the live network and
Chrome generator is deliberately an explicit evidence-capture action frozen
to the dated artifact:

```sh
pnpm validate:epoch-top-level
pnpm exec tsx scripts/generate-epoch-top-level-evidence.mjs
```

Later evidence requires another versioned successor rather than silently
overwriting v1 through v4.

I-090 is closed at the framing-mode boundary. Q-046, Q-048, Q-049, Q-250, and
I-180 remain open for unstealable target-compositor Home/Back, hostile capture
and failure recovery, hands-on controller playability, post-ready
responsiveness/login/offline semantics, and ARM64/x86-64 Linux evidence.

## Residual boundary

This tranche does not yet prove:

- unstealable compositor-owned Home, Back, Pause, or forced exit;
- focus, fullscreen, pointer-lock, crash-overlay, and TV lifecycle behavior;
- cgroup/service-manager descendant ownership, resource ceilings, or hostile
  process cleanup on the target Linux assemblies;
- browser binary/version pinning, enterprise policy, update ownership, or
  protected native-host invocation;
- network-request allowlisting inside an allowed page, service-worker egress,
  storage quotas, or DNS/IP containment;
- qualified readiness/liveness wrappers for each game, production liveness
  timing, a console-owned recovery overlay, bounded restart policy, or
  truthful login and offline recovery;
- popup-based authentication, downloads, camera, microphone, or other
  permission-requiring hosted games; or
- ARM64 and ordinary x86-64 Linux behavior.

The random DevTools endpoint is loopback-only developer plumbing, not an
authorization boundary against another local process. Production integration
must keep it inside a separately privileged, least-authority browser owner.

I-180 therefore remains active.
