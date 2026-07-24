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
reviewed entrypoint through `Page.navigate`.

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

An allowed document `load` event is reported as exactly that. It is not called
game-ready, compositor-ready, interactive, or healthy.

## Automated evidence

Fifteen focused cases cover:

- strict policy derivation and immutability;
- runtime, ID, origin, credential, duplicate, bound, timeout, entrypoint, and
  health authority rejection;
- allowed same-origin and reviewed multi-origin navigation;
- malformed, downgraded, credentialed, subdomain, foreign, `file:`, `data:`,
  and `chrome:` refusal;
- popup, download, and renderer-crash terminal behavior;
- first-violation retention and guard lifecycle;
- redirect-before-request enforcement, redirect bounds, missing locations, and
  unhealthy responses; and
- fixed process arguments without `--no-sandbox` or
  `--disable-web-security`; and
- destructive-profile lexical scope, including refusal of the temporary root,
  unrelated names, short names, and nested paths.

The final test launches installed Chrome headlessly three times through real
random DevTools endpoints and separate ephemeral profiles. It arms the
production guard, injects a forbidden `data:` top-level navigation, popup, and
download, observes `NAVIGATION_ORIGIN_DENIED`, `POPUP_ATTEMPT`, and
`DOWNLOAD_ATTEMPT`, closes each owned browser with exit code 0, and verifies
each profile directory is gone. The 2026-07-24 Windows evidence used Chrome
150.0.7871.182.

Run:

```sh
pnpm exec tsx --test scripts/hosted-browser-supervisor.test.ts
pnpm supervise:game catalog/determined.vcg-game.json --dry-run
```

The real-Chrome case skips only when neither `VCG_CHROME_PATH` nor a known
installed Chrome/Chromium path exists. A target qualification run must require
the exact selected browser rather than accepting that skip.

## Epoch top-level evidence

`benchmarks/hosted-browser/epoch-top-level-windows-v1.json` records one live
2026-07-24 Windows x64 run against
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

The probe reuses the production policy derivation, blank-page attachment,
navigation guard, browser shutdown, and profile cleanup. Its result contains
only final URL, title, ready state, browser product, exit status, and cleanup
state. It does not inspect game content or confer readiness authority.

The artifact binds the exact supervisor, live generator, and strict validator
SHA-256 values. Eight mutation tests reject framing authorization, altered
headers or origins, weakened load/cleanup facts, fabricated play/controller/
participant evidence, playability promotion, stale provenance, and unknown
fields. Routine tests validate the recorded artifact; the live network and
Chrome generator is deliberately an explicit evidence-capture action frozen
to the dated artifact:

```sh
pnpm validate:epoch-top-level
pnpm exec tsx scripts/generate-epoch-top-level-evidence.mjs
```

Evidence captured after 2026-07-24 requires a versioned successor rather than
silently overwriting the date and claim boundary of this record.

I-090 is closed at the framing-mode boundary. Q-046, Q-048, Q-049, and I-180
remain open for unstealable target-compositor Home/Back, hostile capture and
failure recovery, hands-on controller playability, explicit game readiness,
and ARM64/x86-64 Linux evidence.

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
- explicit game readiness, heartbeat, hang detection, or truthful login and
  offline recovery;
- popup-based authentication, downloads, camera, microphone, or other
  permission-requiring hosted games; or
- ARM64 and ordinary x86-64 Linux behavior.

The random DevTools endpoint is loopback-only developer plumbing, not an
authorization boundary against another local process. Production integration
must keep it inside a separately privileged, least-authority browser owner.

I-180 therefore remains active.
