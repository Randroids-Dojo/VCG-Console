# Browser document policy boundary

Last updated: 2026-07-24

## Scope

The console lab now sends explicit browser-security headers for every HTML
navigation served by Vite development or preview. The trusted launcher,
cooperative bridge fixtures, and hostile policy fixture receive separate
Content Security Policies instead of sharing one permissive document policy.

This is desk-lab defense in depth for the trusted launcher and an embedded
cross-origin test boundary. It is not the supervised top-level hosted-game
lane required by I-180, and a production loopback server must reproduce these
headers before they count as an appliance control.

The separate [hosted browser preview boundary](HOSTED_BROWSER_PREVIEW.md)
removes raw external-link authority from the Museum rehearsal and binds one
visible unsupervised tab to an exact generated-catalog origin. It deliberately
does not upgrade that tab into the missing supervised lane.

## Trusted launcher policy

The launcher document policy:

- loads scripts, styles, fonts, images, media, workers, and models only from
  the launcher origin, with `blob:`/`data:` limited to the local asset classes
  that currently require them;
- permits WebAssembly compilation without permitting general JavaScript
  `eval`;
- permits HTTP host-API connections only to IPv4 loopback and development
  WebSocket connections only to loopback;
- denies frames, forms, objects, base-URL changes, and every frame ancestor;
- sends no referrer;
- enables cross-origin opener/embedder isolation and origin-agent clustering;
  and
- defaults cross-origin resource loading to same-origin.

The Permissions Policy keeps the launcher camera and gamepad capabilities
same-origin. It denies microphone, location, display capture, fullscreen,
accelerometer, gyroscope, magnetometer, MIDI, payment, picture-in-picture,
public-key credential retrieval, wake lock, serial, USB, and web sharing.
Autoplay and encrypted media are same-origin only.

The loopback `connect-src` is not authorization. The Rust host still requires
an exact launcher origin and fresh bearer capability, and trusted-launcher
script execution remains a high-value threat because it can read that
capability.

## Fixture-specific policies

Cooperative bridge fixtures receive only the script and frame relationships
their tests require. Cross-origin child documents explicitly name
`http://127.0.0.1:4173` as their only frame ancestor and opt into
`Cross-Origin-Resource-Policy: cross-origin` solely so the isolated test host
can embed them.

The hostile fixture runs at `http://localhost:4173` inside a launcher-origin
page at `http://127.0.0.1:4173`. Its iframe sandbox grants scripts and preserves
the child's origin, but grants none of:

- popups;
- top navigation;
- downloads;
- forms;
- pointer lock; or
- presentation/fullscreen delegation.

The hostile child also receives `connect-src 'none'`, `form-action 'none'`,
no frame descendants, no media or image loads, no objects, no base URL, and
the parent document's deny-by-default Permissions Policy.

## Executable abuse evidence

The Chrome test grants camera, microphone, and location permission to the
hostile child's origin before loading the fixture. It then proves:

| Attempt | Enforced boundary | Observed result |
|---|---|---|
| Read parent DOM | Cross-origin same-origin policy | `SecurityError` |
| Camera | Parent Permissions Policy | denied despite site permission |
| Microphone | Parent Permissions Policy | denied despite site permission |
| Location | Parent Permissions Policy | denied despite site permission |
| Fullscreen capability | Parent Permissions Policy | reported denied |
| Network request | Child CSP `connect-src 'none'` | rejected; no request observed |
| Popup | iframe sandbox | no popup created |
| Top navigation | iframe sandbox | exception; top URL unchanged |
| Download | iframe sandbox | no download event |
| Form submission | Child CSP `form-action 'none'` | no request; top URL unchanged |
| Fullscreen request | Permissions Policy and absent delegation | rejected |
| Pointer lock | iframe sandbox | rejected |

The test also reads the actual launcher, host, and child response headers. A
meta tag or source comment alone is not accepted as proof.

Run the focused evidence with:

```sh
pnpm --dir apps/console-lab exec playwright test --grep "browser policy denies"
```

## Residual boundary

This tranche does not prove:

- containment of a hostile top-level hosted game;
- protection from hostile code or XSS already executing at the trusted
  launcher origin;
- enforcement by the future production loopback server, browser enterprise
  policy, compositor, or service manager;
- post-launch redirect/origin containment, custom protocol or `file:`
  navigation, service-worker/storage partitioning, popup/process cleanup,
  resource ceilings, crash/hang recovery, or browser-profile destruction;
- unstealable Home/Back/Pause, pointer-lock/fullscreen recovery, or controller
  focus outside the page; or
- target ARM64/x86-64 Linux behavior.

I-136 therefore advances to `active`, not `closed`. I-180 remains open for the
supervised top-level lane and I-150/I-209 remain responsible for privileged
input, compositor, process, and target evidence.
