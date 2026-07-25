# Owner questions: local-web explicit readiness

Last updated: 2026-07-25

These choices do not block the implemented strict cooperative protocol. They
block producer qualification, native integration, final launch behavior, and
target claims.

## LWR-001: challenge and instance producer

Which production component creates local-web instance and challenge IDs, and
where is uniqueness enforced across restart?

Safe default: the native launch coordinator creates independent 128-bit-or-
greater CSPRNG values after it binds the exact signed release and owned browser
process. Values remain volatile, never contain profile/game-save data, and are
not reused after process replacement, host restart, launch cancellation, or
timeout.

## LWR-002: reviewed ready point

What exact condition may each bundled local-web release call `ready`?

Safe default: a reviewed wrapper publishes ready only after required assets,
game state, input handlers, and the first interactive scene are initialized.
It must not wait for login, profile, save, leaderboard, payment, or private
player data merely to make generic readiness succeed. Record the producer
source hash and release-specific prerequisites.

## LWR-003: launch expiry

What default expiry should local-web launches use?

Safe default: keep the manifest's bounded launch timeout authoritative, with a
15-second local default only after representative cold-cache evidence. Do not
extend a challenge from game messages. Retry creates a new owned instance and
challenge rather than reviving an expired one.

## LWR-004: compositor composition

Which host observations must accompany cooperative `ready` before the launcher
declares launch success?

Safe default: require the exact supervised page/process to be alive, visible,
focused, top-level within its owned surface, controller-routable, and under
unstealable Home/Back recovery. Keep these host-owned observations separate
from the game message so a page cannot self-certify containment.

## LWR-005: degraded and failed UX

Which protocol reasons should be visible to players, and which should trigger
automatic retry?

Safe default: map them to existing bounded host text such as Starting,
Recovering, Service unavailable, Timed out, and Failed. Never show game text,
paths, exception messages, resource URLs, or account state. Permit automatic
retry only under an explicit bounded host policy with a fresh instance.

## LWR-006: post-launch health

Should this launch challenge become a continuing health heartbeat?

Safe default: no. Consume it only for bounded launch admission. Use a separate
versioned watchdog/health contract if continuing liveness is required, with
its own cadence, expiry, backoff, suspend/offline behavior, and retention
review.

## LWR-007: local package origin

Which exact origin shape will the production local-package server expose?

Safe default: a host-owned numeric loopback origin with an unpredictable
per-instance path outside the readiness message, restrictive response
headers, no directory listing, no credentials, and exact package binding.
Do not treat arbitrary LAN HTTP, `file:`, public HTTPS, service-worker cache,
or a game redirect as local-package authority.

## LWR-008: Motion bridge ordering

May Motion negotiation occur before generic game readiness?

Safe default: the host may prepare Motion independently, but it must not
publish player frames or actions until the exact game instance is admitted and
the relevant permission/session gates pass. Readiness itself grants no Motion
profile. Freeze the final ordering with browser and target tests.

## LWR-009: dishonest producer qualification

What adversarial cases must a release pass before its producer is trusted for
launch UX?

Safe default: test ready-before-first-scene, hidden page, sibling window,
navigation replacement, stale worker, asset failure, main-thread hang,
renderer crash, controller loss, focus theft, suspend/resume, process restart,
and forged/replayed messages. A cooperative success remains only one input;
host-owned observations must catch claims the page cannot honestly prove.
