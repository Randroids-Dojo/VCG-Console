# Full catalog candidate reconciliation

Evidence date: 2026-07-24

Status: non-authoritative 26-title candidate ledger; I-104 remains active

Qualification result: zero new admissions and zero host-authority grants

## Outcome

All 26 entries in the 2026-07-19 VibeCoded.Games snapshot now have one
explicit console candidate record covering:

- catalog class and live/final entrypoint;
- current checked-in public-manifest and launcher-catalog presence;
- exact source status and commit where available;
- candidate runtime and network class;
- offline, input, reserved Home/Back, architecture, and permission
  qualification state;
- bounded service-signal categories and degradation status;
- rights, owner authorization, and redistribution status;
- candidate trust tier, admission status, and blocker codes.

The reconciliation is deliberately fail-closed:

- all 26 are conservative `remote-web` candidates;
- all 26 remain `network: required` candidates;
- all 26 have no offline qualification;
- all 26 have unverified input and architecture;
- all 26 have no reviewed permissions and no host authority;
- all 26 remain admission-blocked;
- the three community entries lack source and rights screens;
- only VibeBots, Mi Casa Es Su Casa, and Determined currently have checked-in
  public v1 manifests and museum launcher entries; and
- no manifest, launcher policy, production catalog, or package was changed by
  this work.

The authoritative current artifact is
[`full-catalog-candidate-ledger-v2.json`](../compliance/catalog-candidates/full-catalog-candidate-ledger-v2.json).
Its 26 records are bound by SHA-256
`65798f7bcb3f08e3b6f2dceb0c28e0ea382091352ff72c480e822b9f68bee245`.
The record digest and zero-authority result are unchanged; v2 advances the
offline/service provenance chain and leaves v1 immutable.

## Authority boundary

This ledger is not:

- a `vcg-game.json` public manifest;
- a signed installed catalog;
- a launcher policy;
- a trust/admission decision;
- a browser origin allowlist;
- a permission grant;
- a package descriptor; or
- owner authorization.

It exists to prevent unknown fields from being silently filled with optimistic
defaults. Empty reviewed-input, architecture, and permission arrays mean no
value is qualified. They do not mean that the title needs no input, supports
every architecture, or may use any capability.

The three current checked-in museum entries are recorded as repository facts.
Presence in the prototype does not retroactively prove family-mode admission,
rights, controller compatibility, service degradation, offline behavior,
containment, or target qualification.

## Bound evidence

The ledger is derived exactly from:

| Evidence | Bound observation SHA-256 |
|---|---|
| First-party repository rights screen | `a74854b7041f9c206433dd35cd8370825e26c710ceb58e2d1c0ddc2ae99f1e81` |
| Remote manifest/service-worker/offline observation | `8a85aaf7ce5c03d72c9751bd4aa9ab349b73ad0de29658c6b7b0287b073535b0` |
| Catalog service-dependency signal screen | `16298d6ced48cd1bc76edeae12ca78e5e4812a28f6e999ed069171dad25827a9` |

Changing any predecessor record invalidates deterministic validation until the
candidate ledger is deliberately regenerated.

## Candidate matrix

`Current` means a checked-in public manifest and museum launcher entry. Service
labels are source/browser signals only. Rights shorthand does not clear
content, title, owner authorization, or redistribution.

| Game | Class | Current | Source | Rights signal | Service signals |
|---|---|---:|---|---|---|
| VibeBots | First-party | Yes | Exact | No code grant observed | Auth, data, notification, external |
| VibePinball | First-party | No | Exact | No code grant observed | External |
| VibeRacer | First-party | No | Exact | No code grant observed | Data, external |
| VibePins | First-party | No | Exact | No code grant observed | Data, external |
| Fracking Asteroids | First-party | No | Exact | No code grant observed | Data, external |
| Hoops | First-party | No | Exact | No code grant observed | Data |
| Mi Casa Es Su Casa | First-party | Yes | Exact | No code grant observed | Data, external |
| Block Punch Kick | First-party | No | Exact | Package `ISC` declaration only | External |
| Epoch | First-party | No | Exact | No code grant observed | External |
| GameTape | First-party | No | Exact | No code grant observed | External |
| GoPit | First-party | No | Exact | No code grant observed | External |
| Block-You | First-party | No | Exact | No code grant observed | External |
| Determined | First-party | Yes | Exact | No code grant observed | Data, AI, external |
| SoftwareDevSim | First-party | No | Exact | No code grant observed | Data, external |
| Baby Piano | First-party | No | Exact | No code grant observed | External |
| Clankers | First-party | No | Exact | MIT text with scope exclusion | External |
| VibeCity | First-party | No | Exact | No code grant observed | Data, external |
| Flatline | First-party | No | Exact | No code grant observed | External |
| VibeGear2 | First-party | No | Exact | MIT text; review required | Data, external |
| Text Racer | First-party | No | Exact | No code grant observed | Data |
| Drop Dead Keep | First-party | No | Exact | No code grant observed | Data, external |
| Streamer Billboard | First-party | No | Exact | No code grant observed | Auth, data, external |
| GoDig | First-party | No | Exact plus unresolved submodule | No code grant observed | External |
| Bone Cleaver | Community | No | Unavailable | Unavailable | External observed |
| Vibeman (Hangman) | Community | No | Unavailable | Unavailable | External observed |
| Asymptotic Bitrot | Community | No | Unavailable | Unavailable | None observed; unknown |

Every record additionally carries:

- runtime qualification `unverified`;
- offline qualification `none`;
- input qualification `unverified`;
- reserved Home/Back qualification `unverified`;
- architecture qualification `unverified`;
- permission qualification `not-reviewed`;
- service degradation `unverified-source-signal-only`;
- owner authorization `not-recorded`;
- redistribution `blocked`;
- trust admission `blocked`; and
- admission/host authority `false`.

## Required promotion gates

A candidate can receive a public manifest and catalog consideration only after
its exact release completes:

1. exact source, build, deployment, and artifact identity;
2. owner, code, content, title, trademark, and notice review;
3. trust-tier, content/age, and family-mode admission;
4. controller/input and reserved Home/Back qualification;
5. network/service inventory and truthful degradation behavior;
6. permission, data, storage, retention, and deletion review;
7. browser containment, navigation, and global recovery controls; and
8. architecture, performance, health, crash, update, and recovery
   qualification.

Public-manifest validation remains separate from installed authority. A valid
remote candidate manifest cannot install a local package, grant a hosted page
host APIs, or enter the signed installed catalog.

## Current three-manifest boundary

VibeBots, Mi Casa Es Su Casa, and Determined already have checked-in v1
manifests and museum launcher entries. Their current repository presence must
not be used as a template that automatically promotes the remaining 23.

Before calling even the current three release-approved, reconcile their
manifest input/permission claims with physical controller tests, browser
containment, exact service declarations, owner authorization, content review,
and target architecture behavior. Any incorrect current field should be fixed
through a reviewed manifest/catalog change, not preserved for consistency.

## Remaining work

I-104 cannot close until:

- every intended release title has a reviewed public manifest rather than only
  a candidate record;
- input devices, controls, player count, text/pointer/touch requirements, and
  reserved actions are measured;
- ARM64/x86-64 browser/runtime behavior is qualified;
- permissions, origins, storage, service data, and degradation states are
  owner-declared and tested;
- exact code/content/title rights and owner authorization are approved;
- family-mode trust/content admission is recorded;
- launcher presence is version/origin scoped and revocable; and
- the host continues to derive installed/local authority only from a signed
  catalog and exact artifacts.

Owner decisions are isolated in
[`OWNER_QUESTIONS_FULL_CATALOG_CANDIDATES_2026-07-24.md`](OWNER_QUESTIONS_FULL_CATALOG_CANDIDATES_2026-07-24.md).

## Reproduction and validation

Generation is deterministic and performs no network access:

```text
node scripts/generate-full-catalog-candidate-ledger.mjs
```

Validation:

```text
node scripts/validate-full-catalog-candidate-ledger.mjs
node --test scripts/validate-full-catalog-candidate-ledger.test.mjs
```

The validator requires the exact three predecessor observations and exact
26-entry reconstruction, all closed zero-authority fields, the current
three-entry repository-state fact, mandatory blockers, the record digest,
derived zero-admission/zero-mutation summary, exact claim limitations, and
bounded canonical UTF-8 JSON. Eight adversarial test groups prevent inventory
substitution, invented manifest/launcher presence, runtime/network/offline
promotion, input/architecture/permission authority, rights/trust admission,
provenance/digest/summary/policy drift, unknown fields, and encoding/size
violations.
