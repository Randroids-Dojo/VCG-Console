# Retro import Unicode abuse hardening — 2026-07-26

Status: deterministic TypeScript and Rust parser hardening implemented; broader
I-142 fuzzing and target evidence remain open

Authority: I-142, I-199, and I-200

## Boundary repaired

The shared retro-import contract already required NFC portable basenames,
bounded relative paths, path-free installed metadata, and safe visible titles.
It rejected ASCII controls, separators, reserved portable names, traversal,
and path punctuation, but invisible Unicode format/direction characters could
still enter a source basename, archive member path, or installed display title.
Those characters can reorder or hide visible text in review, launcher, audit,
or recovery surfaces without changing the bound content hash.

TypeScript and Rust now reject:

- C0/C1 controls and non-ASCII whitespace/line separators;
- soft hyphen, Arabic letter mark, and Mongolian vowel separator;
- zero-width, left/right-mark, bidi embedding/override/isolate, and word-joiner
  controls;
- byte-order/zero-width no-break mark and interlinear annotation controls;
- shorthand, musical, language-tag, and tag format controls; and
- isolated UTF-16 surrogate values at the TypeScript intake boundary.

Ordinary ASCII space remains allowed inside a visible title. The TypeScript
installed-library parser now counts its 80-character title ceiling in Unicode
scalars, matching JSON Schema length semantics, the title derivation path, and
the Rust host rather than rejecting valid astral characters at half the stated
limit.

## Evidence

The TypeScript corpus injects eight exact unsafe characters into all three
surfaces: a plain source basename, a nested archive member path, and an
installed title. Every mutation is rejected with the closed domain error. It
also proves exactly 80 game-controller emoji scalars are accepted and 81 are
rejected.

The Rust corpus independently rejects the seven scalar-value cases that valid
UTF-8 can represent and proves the same 80/81 scalar boundary. No raw media,
source path, participant data, device identifier, or unbounded input is added
to evidence.

## Claim limit

This is a fixed adversarial regression corpus, not coverage-guided fuzzing,
archive-decoder qualification, hostile physical-media evidence, sandbox proof,
target-process observation, or a claim that every Unicode confusable is
blocked. ZIP implementation, large/hostile corpus work, physical USB faults,
target architectures, and the remaining I-142/I-199/I-200 gates stay open.
