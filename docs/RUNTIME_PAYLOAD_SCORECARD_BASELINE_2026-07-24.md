# Runtime payload scorecard desk baseline

Evidence date: 2026-07-24

Status: strict prequalification baseline; I-182 remains open

Qualification result: zero final payload selections and zero qualified target
cells

## Outcome

The D-057 bundled-web versus native rubric is now represented as one strict,
machine-validated scorecard for the five I-182 subjects:

- VibeBots;
- Mi Casa Es Su Casa;
- Determined;
- the repository obstacle sample; and
- the VCG Tiny Motion Game Godot sample.

Every subject has both `bundled-web` and `native` candidates, and every
candidate has separate `linux-x86_64` and `linux-arm64` target cells. That
produces 20 explicit cells. All 20 remain unqualified, all five selections
remain blocked, and no maintenance estimate, admission authority, host
authority, package approval, or production catalog mutation is recorded.

The authoritative artifact is
[`runtime-payload-scorecard-desk-baseline-v1.json`](../compliance/runtime-scorecard/runtime-payload-scorecard-desk-baseline-v1.json).
Its five subject records are bound by SHA-256
`6363eca6e34a531374cff91f8a72be4d5858ab6f4bb0cc978faae928ee0fe45b`.

## Rubric

The scorecard requires evidence for all eight D-057 dimensions before a
payload can be selected:

1. architecture portability;
2. performance and latency;
3. controller and Motion behavior;
4. offline and service behavior;
5. package size and storage headroom;
6. security boundary;
7. build reproducibility; and
8. maintenance cost and ownership.

The rubric is conjunctive. A strong result in one dimension cannot compensate
for a missing target, unsafe input path, unresolved service dependency,
unreviewed rights, absent recovery behavior, or unnamed maintenance owner.

## Evidence preserved

### Controlled public-source titles

The three current hosted titles are tied to their exact public repository
commits and to the committed rights, service, offline, input-surface, and
candidate-ledger observations.

| Title | Exact source | Files | Source archive | Runtime dependencies | API routes | Asset-like files | Online requests | Offline reload | Gamepad polls |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|
| VibeBots | `f9b988ca72bbd2f2083ad3530366f8c57847e482` | 702 | 8,039,484 B | 13 | 73 | 70 | 61 | Failed | 341 |
| Mi Casa Es Su Casa | `c296f181d94d594ffd8be855d8d0f4a808f19374` | 136 | 334,252 B | 6 | 7 | 2 | 23 | Failed | 0 |
| Determined | `7d9a38dc2c64915808c4a0a7081133ebb1865eec` | 46 | 158,802 B | 1 | 3 | 0 | 79 | Failed | 0 |

These are source and hosted-browser measurements. Source archive bytes are not
release-package bytes. Request counts are not frame pacing. Neutral Gamepad API
polls are not controller qualification. A failed offline document reload does
not by itself prove which smaller local feature set could be extracted safely.

The source screen also preserves the current service signals:

| Title | Auth | Database | AI | Notifications | External-network signals |
|---|---:|---:|---:|---:|---:|
| VibeBots | 16 | 1 | 0 | 4 | 18 |
| Mi Casa Es Su Casa | 0 | 5 | 0 | 0 | 3 |
| Determined | 0 | 1 | 1 | 0 | 2 |

Signal counts locate review work; they do not establish that a service is
required, safe, available, replaceable, or approved. All three titles still
have blocked redistribution, no recorded owner authorization, no local build,
no target execution, no physical controller run, and no maintenance estimate.

### Obstacle sample

The obstacle subject binds five tracked implementation files totaling 79,971
bytes. It consumes standardized Motion actions inside the console lab, but it
does not have an independent build target, package manifest, signature,
storage namespace, sandbox, health check, update path, or target result.

The scorecard therefore records source-only evidence. It does not infer the
size or behavior of a future standalone bundled-web package from the complete
console-lab build.

### Godot Motion sample

The Godot subject binds eight tracked source files and the exact existing
Godot 4.7.1 export evidence:

| Payload | Artifact bytes | Execution evidence |
|---|---:|---|
| Web | 39,867,945 | Windows Chrome desk load; 722.712 ms diagnostic ready time |
| Linux x86-64 | 73,490,496 | WSL2 headless boot only |
| Linux ARM64 | 67,066,904 | Structurally identified export; not executed |

This is the only subject with both Web and native artifacts. It is still not a
runtime selection. The Web observation used keyboard and synthetic Motion
evidence, the native build has no selected Motion IPC, neither payload ran as
a signed console package, and neither target architecture has the complete
performance, controller, offline, recovery, or maintenance result.

## Fail-closed interpretation

- Keep VibeBots, Mi Casa, and Determined on their current supervised remote-web
  candidate path until rights and exact local builds exist.
- Do not call bundled web the default merely because all three controlled
  public repositories currently contain web code.
- Do not call Godot native the winner merely because its x86-64 and ARM64
  exports exist.
- Do not call the obstacle component a local game package until it has an
  independent reproducible payload and package lifecycle.
- Do not compare archive bytes with release payload bytes or a Windows browser
  ready timestamp with target gameplay performance.
- Require the same exact workload, input, offline, recovery, and measurement
  definitions for both selected hardware architectures.

## Remaining qualification

I-182 still requires, for every selected payload candidate:

- reproducible exact release artifacts and signed package manifests;
- ordinary Linux x86-64 and Raspberry Pi Linux ARM64 launches;
- frame pacing, CPU, GPU, RAM, storage, power, thermal, launch-time, and
  controller/Motion latency measurements under the concurrent console
  workload;
- physical controller-only start, play, pause, recovery, Home, Back,
  disconnect, reconnect, and forced-exit tests;
- cold offline and degraded-service play, save, reset, update, rollback, and
  recovery;
- installed, update-peak, cache, save, and rollback storage measurements;
- sandbox, permission, origin or IPC, watchdog, hostile-content, and crash
  evidence;
- repeated builds with exact toolchains, dependency locks, notices, and
  corresponding source;
- named maintenance ownership and comparable estimates; and
- separate rights, content, privacy, admission, and owner-authorization
  approval.

Owner decisions are isolated in
[`OWNER_QUESTIONS_RUNTIME_PAYLOAD_SCORECARD_2026-07-24.md`](OWNER_QUESTIONS_RUNTIME_PAYLOAD_SCORECARD_2026-07-24.md).

## Reproduction and validation

The generator is deterministic and reads only committed repository evidence
and tracked source files:

```text
node scripts/generate-runtime-payload-scorecard.mjs
```

Validation:

```text
node scripts/validate-runtime-payload-scorecard.mjs
node --test scripts/validate-runtime-payload-scorecard.test.mjs
```

The validator requires the exact five subjects, eight rubric dimensions, two
payload candidates, two architectures, source/browser/service/input/export
measurements, zero target qualifications, zero selections, zero authority,
derived digest and summary, exact limitations, and bounded canonical UTF-8
JSON. Nine adversarial test groups reject inventory substitution, selection or
exception promotion, invented target results, evidence drift, source/export
substitution, authority promotion, provenance/rubric/digest/summary drift,
unknown fields, and malformed or oversized records.
