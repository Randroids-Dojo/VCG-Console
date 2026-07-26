# Sudden-power campaign status audit

Date: 2026-07-25

Status: I-114/I-202 status reconciliation; no physical result

## Outcome

The repository already contains the strict sudden-power campaign tranche from
commit `219b53b`:

- [`POWER_CUT_CAMPAIGN_2026-07-24.md`](POWER_CUT_CAMPAIGN_2026-07-24.md),
  SHA-256 `c6fb2adf8d973f014238de90c057b8c966e962d6785a630b7523765806adf01b`;
- [`OWNER_QUESTIONS_POWER_CUT_CAMPAIGN_2026-07-24.md`](OWNER_QUESTIONS_POWER_CUT_CAMPAIGN_2026-07-24.md),
  SHA-256 `a08d15767c99a8f9abd342afa709c9f7e6864a02b589c4b98207e6176f4914cd`;
- `scripts/validate-power-cut-campaign.mjs`, SHA-256
  `3299a88490e517848301e03fb08154e383c1c4846622e5b392f4326e47ad3527`;
  and
- its focused test, SHA-256
  `9c90d325313c4bb0cf0381f9c487c9e40c9d02ac383fc55a06278e76e950f078`.

The investigation register still called I-114 and I-202 `open`. That no longer
described the current repository. Both are now `active`: their pre-registration
and evidence-validation boundary exists, while the physical campaign remains
blocked and unrun.

## Requirement mapping

I-114's required independent operation classes map directly into the frozen v1
vocabulary:

| I-114 surface | Campaign operation and transition evidence |
|---|---|
| OS | `boot`, `system-update`, `filesystem-recovery`, plus prior healthy slot and protected-state oracles |
| Game package | `package-update` and `package-rollback`, with generation, activation, catalog and artifact consistency |
| Retro import | `retro-import`, including scan, staging, copy, synchronization, publication, cancellation and cleanup |
| Profile | `profile-vault`, including ciphertext, manifest, protected commit, tombstone and reset boundaries |
| Save | `save-checkpoint`, including temporary payload, synchronization, replacement, acknowledgement, migration, unlink and reset |

The common committed-state oracle requires every pre-cut acknowledged synthetic
value to remain semantically valid. The plan permits only prior committed,
exact pending commit, exact new committed or named explicit recovery outcomes.
It therefore captures I-114's prior-healthy, committed-data, partial-cleanup and
bounded-uncommitted-loss boundary without treating file existence as proof.

I-202 adds `idle`, `log-rotation`, `low-space` and the complete Pi/card/fixture
qualification surface. Every frozen plan must cover all eleven operation
classes, every implemented durable transition, at least 200 valid scheduled
cuts, and the four bootability, committed-state, authority-consistency and
trial-provenance core oracles.

## Current verification

On 2026-07-25, the focused Node suite passed all 12 tests. It proves that the
validator:

- accepts an exact complete 200-trial zero-failure ledger;
- exercises the file CLI;
- rejects fewer trials or a missing operation class;
- binds results to exact plan bytes;
- accounts for every planned trial in order;
- refuses a passing disposition with a failed oracle;
- derives rejection from one valid product failure; and
- keeps harness-invalid or stopped campaigns incomplete.

This is schema and derivation evidence only. The generated test plan uses
synthetic digests and cannot be promoted as a target campaign.

## Remaining boundary

No tracked frozen physical plan or result exists. The exact Pi assembly,
production power supply, qualified card/cohort, image, filesystems, mounts,
transaction builds, transition markers, independently retained semantic and
protected-state oracles, relay/rail-decay fixture, schedule, environment,
baseline restore, recovery image, retention policy, destructive authority,
valid cut or hardware result remains absent.

Q-197 still owns the field-reliability claim beyond the 200-trial floor. Q-198
still owns whether the electrical scope includes only abrupt input removal or
also brownout/dropout/undervoltage/reconnect waveforms. These questions remain
in the existing dedicated owner-question document; no default answer was
silently promoted by this audit.
