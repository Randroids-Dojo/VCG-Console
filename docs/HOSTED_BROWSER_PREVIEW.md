# Hosted browser preview boundary

Status: exact allowlisted browser-only preview implemented; supervised
top-level hosted-game runtime remains open under I-180.

## Purpose

The browser lab must not describe a normal external tab as a supervised game
process. The current Museum path is therefore an explicitly unsupervised
preview. It exercises catalog-bound destination authority and honest loading
copy without claiming a separate browser profile, navigation containment,
reserved controls, crash recovery, or native-host reachability.

## Exact preview authority

`HostedBrowserPreviewController` accepts a closed bounded registry of at most
64 destinations. Each record contains only:

- one safe unique catalog ID; and
- one unique credential-free HTTPS origin with no path, query, fragment, or
  embedded username/password.

Unknown fields, duplicate IDs, duplicate origins, non-HTTPS URLs, URL paths,
credentials, unsafe IDs, empty input, and excessive input fail closed.

Preparing a destination creates one frozen plan containing the exact
destination ID, origin, schema version, and
`unsupervised-browser-preview` disclosure. It replaces any earlier plan.
Opening requires the same object reference issued by that controller. An
identical clone, cross-controller plan, replaced plan, discarded plan, or
replay is rejected before `window.open` runs.

The controller consumes authority before invoking the browser so a throwing
or reentrant opener cannot reuse it. A successful call uses only:

```text
window.open(EXACT_CATALOG_ORIGIN, "_blank", "noopener,noreferrer")
```

It also clears the returned window's `opener`. A blocked or throwing popup
returns a closed `PREVIEW_BLOCKED` result. The launcher then issues a fresh
plan for the same catalog destination and shows a local retry message; it
does not substitute another URL.

## Launcher integration

The launch screen no longer renders a caller-supplied external `href`.
Remote preview actions use the same button callback as other launcher actions,
while Svelte holds the exact issued plan as raw state.

The Museum flow:

1. reads the browser's current `navigator.onLine` signal;
2. displays the exact catalog host;
3. states that reachability and containment are not verified;
4. prepares the exact Museum-origin plan; and
5. opens it only after the user selects **Open unsupervised preview**.

Back, Exit, a replacement launch, component destruction, or a successful open
discards the current plan. Browser `online` status remains only a local hint;
it is not an HTTP health check and is never described as native-host evidence.

## Automated evidence

Fourteen focused unit cases cover:

- exact origin/target/feature arguments and opener removal;
- plan immutability and one-shot consumption;
- clone, cross-controller, replacement, discard, and replay refusal;
- blocked, throwing, reentrant, and restrictive `WindowProxy` behavior;
- unsafe/duplicate registries; and
- unknown destination refusal.

Three real-Chrome flows cover the visible unsupervised disclosure, the generic
remote launch presentation, offline/retry behavior, blocked-popup reissue,
exact repeated origin handoff, and the absence of raw link authority. The
handoff test replaces `window.open` with a local observation stub; it makes no
external request.

## Residual boundary

This is trusted-launcher regression evidence, not the I-180 production lane.
Same-origin compromise can bypass browser JavaScript policy and call browser
APIs directly. A separate external tab still has normal browser chrome and
does not provide:

- an isolated ephemeral browser profile or storage partition;
- post-launch redirect/origin, popup, download, custom-scheme, or `file:`
  containment;
- process ownership, resource ceilings, hang/crash collection, or cleanup;
- controller-focus assignment or compositor-reserved Home/Back/Pause;
- login, network-loss, permission, fullscreen, pointer-lock, or hostile-page
  recovery;
- authenticated native-host launch/readiness evidence; or
- ARM64/x86-64 Linux qualification.

Until those controls exist, the product must continue to call this an
unsupervised preview and must not represent any hosted game as appliance-safe.
