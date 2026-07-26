# Retro performance benchmark contract

Status: strict campaign/result authority implemented; no target run recorded

Last updated: 2026-07-24

I-130 requires representative 8-bit, 16-bit, 32-bit, 64-bit, and arcade
evidence on every supported hardware target. A fast development run, averaged
FPS value, or result from a different frontend/core/content build must not be
promoted into that evidence.

## Campaign authority

`@vcg/retro-performance-contract` defines a closed v1 campaign with at most
eight targets and forty runs. Every target binds:

- opaque target ID and exact Linux architecture;
- SHA-256 identities for the hardware inventory and OS image;
- exact frontend ID, version, and SHA-256;
- output width, height, and refresh rate;
- exact frame, audio, power, and thermal probe IDs; and
- the SHA-256 identity of the instrumentation policy.

Targets are strictly ID-sorted. Each target requires exactly one run in each
fixed class, in this order: 8-bit, 16-bit, 32-bit, 64-bit, and arcade. A run
binds one opaque case and system ID, exact core ID/version/hash, exact content
ID/hash, and explicit limits for:

- minimum observed duration;
- p95 and p99 frame interval;
- missed-frame rate per million frames;
- p95 audio latency and underrun count;
- peak power; and
- peak temperature.

The contract contains no ROM bytes, paths, filenames, download URLs, game
display names, operator identity, or free-form claims. Content rights and
admission remain separate prerequisites.

## Result authority

A result is explicitly either `physical-target` or `development-dry-run`.
Every observed case repeats the exact target, platform, frontend, core,
content, probe, and instrumentation-policy identities. It also binds
calibration and raw-telemetry hashes before carrying:

- observed duration, total frames, and missed frames;
- p50, p95, p99, and maximum frame intervals;
- p50 and p95 audio latency plus underruns;
- mean and peak power;
- start, peak, and end temperature;
- throttling, crash, and hang counts; and
- sorted known-limit IDs, categories, and evidence hashes.

Metric relationships are validated: quantiles are monotonic, missed frames
cannot exceed total frames, mean power cannot exceed peak power, and peak
temperature must cover the start and end readings.

## Qualification

Only exact parsed plan/result objects can be evaluated. Campaign revision,
complete run ordering, and every repeated identity must match. Substitution is
an error rather than a disappointing benchmark result.

Development dry runs always remain blocked. Physical runs fail when any case:

- is too short;
- exceeds either frame-interval or missed-frame-rate limit;
- exceeds audio latency or underruns;
- exceeds peak power or temperature; or
- observes throttling, a crash, or a hang.

Missed-frame rate uses integer arithmetic across the full safe-integer schema
range. A known-limit ID repeated by multiple cases must retain the exact same
category and evidence hash. Qualification preserves the sorted known-limit
records rather than converting them into an unqualified success claim.

Only the exact current qualified object can produce a bounded downstream
binding. Clones, stale results, incomplete matrices, and result substitution
fail.

## Evidence

Seventeen focused tests cover:

- a complete qualifying physical matrix;
- all five classes independently for two targets;
- dry-run refusal;
- every metric and lifecycle failure code;
- hardware, OS, frontend, core, content, probe, and method substitution;
- incomplete, stale, duplicated, and reordered matrices;
- threshold and metric consistency;
- known-limit ordering and conflicting evidence;
- exact missed-frame arithmetic at safe-integer bounds;
- path/name/URL/byte/operator/arbitrary-summary exclusion;
- bounded canonical UTF-8 JSON; and
- cloned/stale authority and deep-freeze behavior.

The package passes strict TypeScript checking. No physical emulator,
controller, display, audio loopback, power meter, thermal probe, target Linux
image, or rights-cleared representative content was exercised.

## Remaining boundary

The owner must select the exact systems, cores, rights-cleared content,
hardware target configurations, output modes, thresholds, probe methods,
calibration procedure, warmup/duration/soak sequence, raw-evidence retention,
and known-limit publication policy. Then each target needs complete physical
runs with reviewed telemetry. This contract prevents weak evidence from being
accepted; it does not create the evidence.
