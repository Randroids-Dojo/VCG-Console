# Local diagnostics and consented export

Status: bounded volatile browser record, review, and consented export implemented; native persistent logging, health aggregation, retention policy, and support workflow remain open.

## Purpose

The desk launcher needs observable failures without creating cloud telemetry or
a hidden collection path. `LocalDiagnosticBuffer` demonstrates the minimum
safe browser boundary:

- only a closed versioned set of stable codes can enter;
- subsystem and severity are derived from each code;
- callers cannot attach messages, paths, identifiers, tokens, frames, or
  payloads;
- at most 256 newest events remain in memory;
- each event has only a buffer sequence and monotonic page-uptime timestamp;
- reload clears the entire record;
- an export cannot exceed 64 KiB; and
- no network or persistent browser-storage method exists.

This is not the future native log store and does not claim crash, reboot, or
power-loss evidence.

## Event shape

```json
{
  "sequence": 4,
  "uptimeMs": 1520,
  "subsystem": "access",
  "severity": "info",
  "code": "mode.admin.entered"
}
```

The current code vocabulary covers launcher readiness, signed-package
inventory availability, launch start, and the family/admin/developer
confirmation lifecycle. It intentionally excludes game/profile IDs, package
versions, URLs, network addresses, exception text, process IDs, filesystem
paths, controller IDs, hardware serials, wall-clock time, and arbitrary
key/value fields.

Unknown codes, negative/fractional uptime, time reversal, and an exhausted
sequence fail closed. When capacity is reached, the oldest event is evicted and
an aggregate `droppedEvents` count increases.

## Export contract

The Developer settings panel offers the following flow:

1. Review local diagnostics creates one exact immutable-to-the-flow snapshot.
2. The screen shows retained/dropped counts, all privacy exclusions, and the
   last eight stable codes.
3. Family mode can review but cannot export or clear.
4. After local admin confirmation, Prepare diagnostics export displays the
   exact file disclosure.
5. Confirm diagnostics export downloads the already reviewed bytes as
   `vcg-console-diagnostics-v1.json`.

Events recorded after review do not silently enter that file. The export
document declares:

```json
{
  "containsRawFrames": false,
  "containsSkeletons": false,
  "containsProfiles": false,
  "containsPersonalIdentifiers": false,
  "containsCredentials": false,
  "containsFreeText": false
}
```

Clear volatile diagnostics is also admin-gated and removes events, eviction
count, sequence, and prior time state. There is no upload, support endpoint,
share API, automatic export, telemetry beacon, local storage, IndexedDB, cache,
or service worker integration.

## Threat boundaries

Closed codes reduce accidental secret and log-injection risk, but the browser
is not a privileged security boundary. Same-origin compromise can fabricate or
suppress browser events, invoke a download, or lie about launcher health. A
real implementation must collect native events after validating their source,
keep its storage outside game/browser authority, and make consent authoritative
through the owner-selected local admin path.

Native logs must remain separate from skeleton trace export. A derived skeleton
is sensitive even without pixels and is never a diagnostic event. Portraits,
body-calibration vectors, profile IDs/names, save contents, developer keys,
host API bearer capabilities, signed metadata bytes, and raw exception output
also remain prohibited.

## Automated evidence

Six focused unit tests cover:

- closed code-to-subsystem/severity derivation and explicit privacy flags;
- exact newest-256 retention and eviction count;
- unknown code, invalid time, reversal, and bundle-time rejection;
- attempted free-text/profile/path/token/frame smuggling;
- deterministic bounded JSON; and
- complete in-memory clear and unlinking.

A real-Chrome test proves family-mode export denial, local admin gating, exact
review disclosure, deliberate two-step download, expected filename and parsed
schema, false privacy flags, absence of the active name/profile ID/URL secret,
and complete clear. The full browser suite still observes no diagnostic upload.

## Remaining qualification

I-116 remains incomplete. Closure requires the choices in
`OWNER_QUESTIONS_DIAGNOSTICS_2026-07-24.md`, a bounded crash-safe native store,
source authentication, redaction tests for every native producer, health
summary UX, target filesystem/full-disk/power-loss behavior, final retention
and rotation, safe clock/provenance policy, controller/accessibility review,
and an independently reviewed export artifact proving that no prohibited data
or credential can enter.
