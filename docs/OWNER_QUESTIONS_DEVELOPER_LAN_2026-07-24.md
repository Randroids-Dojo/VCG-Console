# Owner questions: paired LAN developer deployment

Date: 2026-07-24

The native trust/session admission layer now fixes rollback resistance,
workstation-key possession, session expiry, and the closed operation
vocabulary. These product and platform selections remain before a listener or
deployment service may ship.

## DL-001: authenticated encrypted transport

Which maintained protocol/library and exact version should provide mutual
authentication, confidentiality, forward secrecy, downgrade resistance, and
channel binding?

Safe default: use a maintained TLS 1.3 implementation with the exact paired
Ed25519 public key pinned to the peer certificate/SPKI. Do not design a custom
record protocol or treat the admission-layer signature as encryption.

## DL-002: console and workstation key protection

Where are the console private key, workstation private key, and protected trust
generation/digest stored on Raspberry Pi and the ordinary x86-64 Linux tier?

Safe default: ship no persistent pairing on a target that lacks a qualified
non-exportable or platform-protected key plus rollback-resistant state. Never
fall back silently to a plaintext private key beside the registry.

## DL-003: first-pair ceremony and discovery

What controller-only steps, comparison code or QR alternative, discovery name,
timeout, retry limit, and across-room disclosure make first pairing deliberate
without exposing a reusable secret?

Safe default: require developer mode, a fresh reserved-input confirmation, an
exact key fingerprint comparison, a 60-second one-shot challenge, and a
separate final confirmation. Discovery advertises no household or profile
identity.

## DL-004: active and idle session limits

Is the current 15-minute hard ceiling acceptable, and what shorter idle timeout
and extension ceremony should apply?

Safe default: retain the 15-minute hard ceiling, close after 2 minutes with no
authenticated operation, and require fresh reserved-local confirmation rather
than silently extending.

## DL-005: listener and discovery surface

Which fixed port, interface rules, IPv4/IPv6 behavior, mDNS/service name,
firewall owner, and link-change behavior are supported?

Safe default: bind only the active private LAN interface after developer mode,
advertise a generic device-scoped service name, reject WAN/VPN/guest interfaces,
and close on link change, sleep, reboot, mode exit, or service restart.

## DL-006: developer artifact namespace

What quota, artifact format, extraction policy, generation retention,
automatic cleanup, and save-data behavior define an unsigned developer build?

Safe default: one strict inert archive format, 2 GiB per-build and 8 GiB total
quota within the existing 8 GiB admission ceiling, two rollback generations,
no production-catalog mutation, and separately marked disposable saves.

Current evidence: the native receipt layer caps one authorized inert blob at
8 GiB and the store at 1,024 ready request directories only as parser/resource
bounds. Those are not a product quota or retention selection. No archive is
parsed and no ready artifact is automatically removed.

## DL-007: logs and audit retention

Which closed codes and bounded metrics may `ReadLogs` return, how long are
pairing/deployment/revocation audit records retained, and who may clear them?

Safe default: reuse the path-free diagnostic vocabulary, exclude arbitrary
stdout/stderr and household identifiers by default, cap bytes and records, and
require local admin review for export or clear.

## DL-008: stolen key and lost workstation recovery

What controller-only revocation, bulk reset, backup, replacement, and incident
response apply when a workstation is lost or suspected compromised?

Safe default: local revocation immediately closes the active session and
advances protected trust state; provide no trust backup or cloud recovery; a
bulk reset removes every workstation without affecting production packages.

## DL-009: operation semantics

What exact state machine and error vocabulary bind Push, Launch, Read logs,
Restart, and Rollback to a developer generation and partial-transfer retry?

Safe default: complete-hash publication before install, one idempotent durable
request record per operation, no arbitrary command or argument, explicit
terminal states, and cleanup of every uncommitted partial object.

Current evidence: whole-artifact Push receipt now uses the session request ID
as a durable no-replay key, verifies exact length/hash, publishes atomically,
and discards incomplete staging rather than resuming it after the volatile
session is lost. Chunked encrypted transport retry and the other four
operations remain unselected.

## DL-010: workflow acceptance gate

What time-to-first-launch and repeat-push target should the controller-only
workflow meet on each tier?

Safe default: measure cold first pairing separately, then require an already
trusted workstation to reach visible developer launch within 30 seconds p95
for a small changed build over the reference LAN without weakening any local
confirmation or verification step.
