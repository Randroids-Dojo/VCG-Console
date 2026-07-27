# First-party motion-adaptation ranking campaign

Status: blocked zero-result plan

Date: 2026-07-26

Scope: I-103

The canonical artifact is
[`first-party-motion-adaptation-ranking-plan-v1.json`](../benchmarks/first-party-motion-adaptation/first-party-motion-adaptation-ranking-plan-v1.json).
It pre-registers how the existing first-party game pool may eventually be ranked
for one later custom motion adaptation. It does not score, rank, select, adapt,
package, admit or publish a game.

## Milestone boundary

D-113 remains unchanged: the obstacle sample is the only custom
motion-controlled game in the first Motion API milestone. Existing-game ranking
cannot begin until all of these exact prerequisites pass:

- the complete obstacle-sample Motion API milestone;
- the first real-room one-player qualification;
- the complete two-player identity, independent-action, menu, freeze and
  recovery qualification; and
- controller-only shell navigation, loading, exit and recovery qualification.

Plans, synthetic evidence, desk runs, hosted reachability, averages or results
from another candidate cannot open the ranking. No I-103 work may be pulled
into the first milestone merely because a title appears promising.

## Candidate pool

The source-bound pool contains all 23 games in the current first-party rights
screen:

1. `vibebots`
2. `vibe-pinball`
3. `vibe-racer`
4. `vibe-pins`
5. `fracking-asteroids`
6. `hoops`
7. `mi-casa-es-su-casa`
8. `block-punch-kick`
9. `epoch`
10. `game-tape`
11. `go-pit`
12. `block-you`
13. `determined`
14. `software-dev-sim`
15. `baby-piano`
16. `clankers`
17. `vibe-city`
18. `flatline`
19. `vibe-gear-2`
20. `text-racer`
21. `drop-dead-keep`
22. `streamer-billboard`
23. `go-dig`

Every candidate begins ineligible, unscored, unranked and unselected. The
rights screen currently records zero owner authorizations and zero offline
redistribution approvals. Repository organization membership, public source,
package license fields, existing catalog cards, hosted reachability, title,
genre, popularity, familiarity and screenshots establish neither eligibility
nor a score.

No candidate may be dropped because its evidence is difficult, its game is less
familiar, or a reviewer prefers another title. Community games, the obstacle
sample and the Godot sample are outside this exact pool. Any pool change needs a
new plan and a complete rerun.

## Seven dimensions

Every game is assessed against seven exact dimensions.

### Mechanic fit

Evidence must bind the current mechanic, states and input; one proposed motion
action map; a fully equivalent controller route; deliberate activation,
cancellation and no-op semantics; failure behavior; and safety constraints. A
genre label, screenshot or imagined gesture is insufficient.

### Ownership

Evidence must close code, assets, fonts, audio, models, title/trademark,
contributors, services, deployment identity, corresponding source, notices,
change authority and an accountable maintenance owner. Public availability or
organization membership grants nothing.

### Code effort

Evidence must enumerate exact architecture, runtime, build, package, Motion API,
controller, save, service, testing, migration, update and continuing-maintenance
work with uncertainty. Repository size, language labels and unsupported
person-hour guesses do not count.

### Latency

Evidence must include the game-specific exposure-to-action budget, game
integration overhead, both target/runtime paths and recovery impact. A candidate
that cannot meet 120 ms p95 at the game API boundary is ineligible. Capture
arrival, inference-only timing, desktop frame rate, synthetic replay or an
average cannot substitute.

### Accessibility

Evidence must cover both blocking personas and approved standing, seated,
partial-motion and controller routes, including comprehension, reach, fatigue,
contraindications, equivalent controls, feedback and recovery. Silent score
normalization, unapproved body-action substitution and synthetic policy results
cannot prove accessibility.

### Multiplayer value

Evidence must show meaningful value within the qualified one- and two-player
contract: identity, calibration, independent action, interference, simultaneous
input, shared state, freeze, menu ownership, join/leave, loss and recovery.
Nominal player count, network multiplayer and four-player potential are not
two-player evidence.

### Showcase value

Evidence must use pre-registered household tasks to test whether the adaptation
truthfully and quickly communicates VCG value, exposes failures, remains useful
after novelty fades and avoids hidden setup. Popularity, visual novelty,
marketing preference and one reviewer's enthusiasm are not evidence.

## Evidence matrix

The campaign crosses:

- 23 candidates;
- 7 dimensions; and
- 2 independent blind reviews per candidate/dimension cell.

That produces 161 required evidence cells and 322 independent reviews. Every
cell needs an exact evidence-packet digest, a closed integer score reason and a
blocking disposition. Reviewers score independently before seeing each other's
work or an aggregate. Adjudication preserves both original records.

Missing, unavailable, blocked, conflicted and adverse evidence remains visible.
It cannot become a zero, mean, neutral or estimated score. One candidate,
dimension, reviewer, best case or aggregate cannot rescue another.

## Scale and eligibility

The closed integer scale is:

- 0: blocking;
- 1: weak;
- 2: adequate;
- 3: strong; and
- 4: exceptional.

Numeric scores do not replace eligibility gates. No weighted result can rescue
incomplete rights or ownership, unknown source/build/deployment identity, an
unsafe or inaccessible mechanic, no equivalent controller route, latency above
120 ms p95, target/runtime failure, service-boundary failure, or one-/two-player
identity and control failure.

The dimension weights, minimum eligible score for every dimension, bounded
implementation and annual-maintenance effort, household comprehension and
repeat-use gates, material lead, rank depth, tie-break order, reviewer policy,
normalization, uncertainty, sensitivity and evidence-expiry rules remain null.
They must be frozen before any reviewer score is produced.

Weights must sum to 1,000,000 ppm. The complete result must publish every score,
uncertainty, blocker and excluded candidate, plus sensitivity analysis across
the approved weight bounds. Post-result weight, threshold, tie-break, pool or
evidence exclusions are forbidden.

## Decision boundary

A complete ranking still selects nothing. The top-ranked candidate receives no
automatic source, build, service, target, participant, adaptation, rights,
security, accessibility, packaging, admission, publication, support or product
authority.

Any later selection requires a separate owner decision over the complete
eligibility and sensitivity record, followed by an explicit adaptation scope
and budget plus separate rights, security, accessibility and release decisions.

## Evidence and authority

Accepted result data is closed and path-free: opaque candidate, dimension,
reviewer, cell, blocker and reason labels; integer scores; counts; ranges;
digests; metrics; categories; and dispositions. It excludes source/artifact/
service payload bytes, personal or stable identities, media/body/profile/save
data, paths and branch/issue identifiers, query URLs, commands and environment
values, credentials/account data, private rights documents and free-form logs.

This plan grants no authority to check out or mutate a repository, retrieve or
build artifacts, operate a game or service, operate targets or peripherals,
collect from adults or children, prototype a motion mechanic, choose weights or
scores, approve rights or release, adapt a title, change the catalog or publish
a product commitment.

Sixteen blockers and the owner choices are recorded in
[`OWNER_QUESTIONS_FIRST_PARTY_MOTION_ADAPTATION_RANKING_2026-07-26.md`](OWNER_QUESTIONS_FIRST_PARTY_MOTION_ADAPTATION_RANKING_2026-07-26.md).

## Verification

```sh
pnpm validate:first-party-motion-adaptation-ranking
```

The validator checks source provenance, exact source-to-pool equality, the
closed semantic contract, prerequisites, candidate and dimension identity,
matrix arithmetic, scoring and non-rescue rules, open gates, D-113, authority,
data policy, blockers, canonical JSON, strict UTF-8 and parser limits.
