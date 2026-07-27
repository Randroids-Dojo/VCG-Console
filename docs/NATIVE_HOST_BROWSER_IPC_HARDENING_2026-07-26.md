# Native-host browser IPC hardening

Date: 2026-07-26

## Scope

The console browser treats every successful loopback response as untrusted input
until it passes the closed client-side contract in
`apps/console-lab/src/native-host-client.ts`. Existing bearer-capability,
exact-origin, timeout, fatal UTF-8, and bounded-body protections remain
unchanged. This tranche narrows the semantic values that may reach launcher
state and visible progress text after those transport checks pass.

All response bodies also pass through
`apps/console-lab/src/strict-json.ts` before schema validation. The parser
permits ordinary JSON whitespace and field ordering, rejects duplicate object
fields at every nesting level after decoding escaped names, and limits
container nesting to 64. The platform `JSON.parse` still performs the final
grammar and value parse. This removes last-field-wins ambiguity without making
the loopback protocol depend on a canonical byte layout.

## Status contract

The status object contains exactly `protocolVersion`, `hostVersion`, `target`,
and `capabilities`.

- `protocolVersion` is 1-64 visible ASCII characters. A well-formed different
  version remains a protocol mismatch; malformed metadata is a protocol error.
- `hostVersion` is 1-128 visible ASCII characters.
- `target` is at most 64 characters and has one lowercase ASCII
  `architecture-operating_system` form.
- `capabilities` contains at most 32 unique lowercase hyphenated identifiers.
  Each identifier is at most 64 characters.
- Unknown fields, duplicate capabilities, controls, whitespace-bearing values,
  non-ASCII text, malformed identifiers, and excessive values fail closed.

The limits cover the producer's current Cargo version, Rust architecture and OS
constants, and fixed capability identifiers without allowing invisible or
ambiguous text into `Launcher.svelte`.

## Signed package projection

Browser-visible package versions now mirror the authoritative installed-catalog
rule: 1-128 visible ASCII characters. The same predicate applies to a single
package response and every inventory entry. Package IDs, runtime, generation,
inventory ordering, uniqueness, count, exact fields, and body-size rules retain
their existing checks.

## Evidence and claim boundary

`apps/console-lab/src/native-host-client.test.ts` covers invisible Unicode,
controls and spaces, unknown status fields, malformed and excessive targets,
duplicate and excessive capabilities, non-ASCII package versions, and both
single-package and inventory rejection paths. `apps/console-lab/src/strict-json.test.ts`
covers top-level, nested, and escaped-alias duplicate fields, the exact nesting
limit, excessive nesting, ordinary whitespace and order, and malformed input.
The production build was regenerated and the launcher TV and OCR-A source-bound
artifacts were rerun against it.

This proves browser-side rejection for the tested document classes. It does not
qualify a native target, package signature, profile registry, process launch,
watchdog, physical controller, television, gameplay, or recovery path. Those
remain separate host, integration, and physical-evidence claims.
