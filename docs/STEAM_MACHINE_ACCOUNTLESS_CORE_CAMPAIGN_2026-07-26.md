# Steam Machine accountless-core campaign

Date: 2026-07-26
Investigation: I-170
Status: blocked zero-result qualification plan

## Outcome

The repository now has a strict pre-registered campaign for deciding whether the
optional retail Steam Machine can run the complete local VCG core without a
Steam account. The plan records no target operation or product result.

The current official documentation does not prove an accountless path. Valve's
[Steam Machine feature guide](https://help.steampowered.com/en/faqs/view/1180-0BA6-4A75-B7CA)
describes first startup as connecting a controller, joining a network, and
logging into Steam. Valve's
[Offline Mode guide](https://help.steampowered.com/en/faqs/view/0E18-319B-E34B-B2C8)
requires starting Steam online with remembered account state, preparing content
online, and retaining stored information. Offline Mode is therefore a
previously authenticated Steam feature, not accountless evidence.

The campaign keeps D-118 unchanged: local launcher, tracking, profiles,
installed VCG packages, and retro operation must work without Steam login on
every tier. A Steam Machine failure keeps that hardware optional; it cannot
weaken the common product contract or rescue either required Raspberry Pi or
ordinary-Linux reference target.

## Canonical artifact

The machine-readable plan is
`benchmarks/steam-machine-accountless/steam-machine-accountless-core-plan-v1.json`.
It is intentionally `blocked`, has `result: null`, and binds eleven existing
accountless, service, package, input, shell, timing, and signed-package sources.

Its validator rejects:

- unknown fields or result claims;
- stale source digests;
- omission of Valve's guided-login and Offline Mode prerequisites;
- remembered credentials or Offline Mode counted as accountless;
- synthetic, desk, other-target, logged-in, or official-description evidence
  promoted into target qualification;
- any Steam dependency in a local core role;
- missing lifecycle cells, hidden failures, aggregate rescue, or invented open
  gates;
- account removal that deletes or reassigns local VCG data;
- recovery of device-only identity through Steam;
- operational authority or sensitive result data.

## Accountless definition

For this campaign, accountless means all of the following are true at the same
time:

1. no Steam account is entered, remembered, restored, or silently selected;
2. no Steam identity, credential, token, cookie, or cloud record is required by
   a local VCG role;
3. no Steam client, SDK, overlay, or Steam-owned process is a readiness,
   control, or recovery dependency for local VCG;
4. no network request is required for the local role after reproducible
   supported installation;
5. local profile, save, package, and unassigned-progress ownership remains
   opaque and independent from Steam identity;
6. controller-only launch, use, failure disclosure, and return remain possible;
7. Steam-only, hosted, and third-party-account features remain separately and
   truthfully disclosed.

A logged-in account used in Offline Mode fails this definition even when the
network is disconnected. A cached page, prior service-worker content, a
previous online launch, remembered credentials, or a Steam client process that
happens to remain silent also fails it.

## Six local core roles

Every lifecycle scenario exercises all six roles independently:

1. `launcher-shell` — controller-visible launcher focus and canonical
   navigation;
2. `tracker-motion-api` — local tracker and Motion API explicit readiness;
3. `local-profile-management` — opaque profile inventory and a non-destructive
   management read without identity association;
4. `signed-local-package` — one installed signed package through interactive
   readiness and host-owned return;
5. `supervised-retro-lane` — one rights-cleared local retro package, save-state
   boundary, and return;
6. `local-save-and-unassigned-progress` — local ownership and availability
   without Steam reassociation.

This plan does not make those dependent investigations complete. The exact
package, retro, profile, save, and tracker artifacts still need their own
qualification evidence; I-170 only proves the account and service boundary on
the exact target.

## Ten lifecycle scenarios

The fixed scenarios are:

1. stock first boot before any Steam login;
2. supported accountless first VCG entry while the network is available;
3. accountless cold restart while online;
4. accountless cold restart with every network interface disabled before power
   application;
5. network loss during each local role;
6. network restoration after the offline interval;
7. Steam client absent, stopped, and failed;
8. a prior disposable Steam account signed out and completely removed;
9. post-SteamOS and VCG update;
10. post-supported reinstall or recovery with explicit local-data disposition.

The first scenario may produce a blocked result. If the stock supported path
cannot reach VCG without login, the campaign records that exact boundary and
stops; it does not invent a shell bypass, retain a household account, or call
Offline Mode accountless.

The final scenario distinguishes availability from identity restoration. A
reimaged system may require device-only profiles to be recreated. It must not
restore or reassociate those identities from Steam.

## Matrix and repetitions

The campaign declares:

- 6 core roles;
- 10 lifecycle scenarios;
- 60 required role/scenario cells;
- 10 valid cycles per cell;
- 600 required cycles.

Every failed, blocked, invalid, stopped, retried, and worst-case cycle remains
visible. A logged-in run, Offline Mode, another target, another role, another
scenario, or an aggregate cannot rescue one failed cell.

## Independent oracles

Every cycle requires independent process, account, identity, network, input,
readiness, storage, and recovery evidence. The structured result measures:

- supported-path disposition;
- controller-usable readiness and canonical-action response time;
- account-login prompts;
- Steam process, SDK, client, or overlay dependencies;
- required network requests and undeclared egress;
- Steam identity, credential, token, cookie, or account-state observations;
- local owner or profile reassociation;
- local data loss or corruption;
- keyboard, mouse, shell, or operator intervention;
- unrecovered failures.

UI copy, cached content, remembered credentials, process liveness, a successful
logged-in run, or another target cannot substitute for those oracles.

## Fixed no-rescue gates

The plan fixes zero as the maximum for every local-core account prompt, Steam
process or client dependency, required network request, undeclared egress,
Steam identity observation, identity reassociation, silent data loss,
controller-only operator intervention, Offline Mode substitution, remembered
credential substitution, and valid product failure.

Every cell must pass. Steam-only features stay separate and disclosed. Account
removal cannot delete or reassign local VCG data. Recovery cannot restore
device-only identity from Steam. The optional target cannot weaken the
accountless requirement.

Readiness, action-response, network-recovery, update/recovery, storage-growth,
and log-growth thresholds remain null. They must be frozen before operation;
this tranche does not choose them opportunistically after a run.

## Service boundary

The result must distinguish five categories:

| Category | Required disposition |
| --- | --- |
| Local VCG core | Available without account or network |
| VCG hosted content | Separately network-dependent without Steam identity |
| Steam store, library, community, and cloud | Steam-account-dependent and truthfully disclosed |
| Third-party account or launcher content | Separately dependent or unavailable without weakening local core |
| Steam Offline Mode | Prior-account offline feature, never accountless evidence |

## Data boundary

Tracked evidence is limited to opaque target/build/role/scenario/cell/cycle,
account-state, and reason labels plus closed counts, timings, digests, metrics,
and redacted service categories.

The repository and result may not contain Steam account names or IDs, email,
phone, credentials, tokens, cookies, QR codes, local profile IDs or display
names, portraits, body data, save contents, package payloads, paths,
environment values, process arguments, query URLs, storage values, raw network
bodies, screen/video/audio/camera/input data, or free-text logs and prompts.

## Authority and blockers

The plan grants no authority to operate the target, create or use a Steam
account, change network state, inspect traffic, install or launch packages,
mutate profiles or saves, update or recover SteamOS, publish compatibility, or
change a product tier.

Twelve blocker questions are collected in
`OWNER_QUESTIONS_STEAM_MACHINE_ACCOUNTLESS_2026-07-26.md`. Until every protocol,
threshold, target tuple, data rule, and owner authorization is frozen, the
execution gate remains blocked and the result remains null.

## Verification

Run:

```text
pnpm validate:steam-machine-accountless-core
```

The focused command validates the canonical artifact and runs adversarial
mutation tests. Aggregate research validation also includes the same test file.

## What this tranche does not prove

This work does not prove a received Steam Machine, a no-login setup bypass,
accountless operation, offline operation, package compatibility, tracker or
Motion behavior, profiles, saves, retro use, controller behavior, update or
recovery safety, performance, usability, qualification, publication readiness,
or a product-tier decision.
