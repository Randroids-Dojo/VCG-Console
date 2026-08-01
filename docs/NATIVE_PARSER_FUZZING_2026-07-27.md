# Native parser fuzzing — 2026-07-27

Status: reproducible coverage-guided smoke harness implemented; target and
long-running campaigns remain open

Authority: I-142

## Harness boundary

`native/vcg-host/fuzz` is a detached Cargo fuzz crate pinned to
`libfuzzer-sys` 0.4.13. Its `native_parser_boundaries` target sends every input
to the following pure, bounded native boundaries:

- accessibility preference JSON;
- update root-anchor and detached-signature JSON;
- protected developer trust state and the developer registry loader;
- protected package-generation, system-update, and update-root state;
- loopback-origin parsing; and
- canonical SHA-256 parsing.

The target deliberately performs no filesystem or network mutation. Eight
tracked valid documents seed schema-deep coverage. The smoke runner uses the
available x86-64 Ubuntu WSL development environment and copies those seeds plus
all build and crash outputs to a new Linux temporary directory. The runner also
creates four temporary 1,025-, 4,097-, 16,385-, and 32,769-byte inputs so every
declared parser-size boundary is crossed in the initial corpus. Coverage
discoveries and crash artifacts therefore never modify the repository. The
runner removes that exact temporary directory after a passing or failing run.

## Reproducible smoke run

Install the pinned runner and toolchain in WSL once:

```powershell
wsl.exe bash -lc 'cargo install cargo-fuzz --version 0.13.2 --locked'
wsl.exe bash -lc 'rustup toolchain install nightly-2026-07-26 --profile minimal'
```

Then run from the repository root:

```powershell
node scripts/run-native-parser-fuzz-smoke.mjs
```

The runner fixes the mutation seed, executes 20,000 cases under libFuzzer and
AddressSanitizer, caps inputs at 64 KiB, and applies a two-second per-input
timeout. A zero exit proves only that this bounded x86-64 Ubuntu WSL development
campaign found no crash, timeout, sanitizer finding, or Rust panic in the named
pure boundaries.

## Claim limit

This smoke campaign is not target-process observation, a sustained or
coverage-saturation campaign, or proof that every accepted document is
semantically safe. It does not exercise package/archive extraction, media or
portrait decoders, filesystem race behavior, browser navigation, native HTTP
framing, signature authority, cryptographic correctness, or ARM64/x86-64 Linux
targets. Archive and decoder fuzzing require a disposable sandbox that contains
any write caused by a traversal or decoder defect. Those I-142 gates remain
open.
