# Project documentation

Start with [Development](DEVELOPMENT.md) to install, build, run and verify the
project. The ordinary appliance and the explicit lab build have separate
commands and outputs. [The cleanup review](PROJECT_REVIEW_2026-09-13.md#execution-record)
records the current cleanup work and its verification.

| Need | Current reference |
| --- | --- |
| Visual design and TV layout | [UI design](UI_OVERHAUL_DESIGN.md), [TV contract](TV_COMPATIBILITY_CONTRACT.md) |
| Shared tokens and compatibility | [Visual tokens](VISUAL_TOKEN_SYSTEM.md) |
| Native profile identity and storage | [Profile registry](PROFILE_REGISTRY.md) |
| Browser capability boundary | [Browser policy](BROWSER_POLICY_BOUNDARY.md) |
| Controller setup and ownership | [Controller input](CONTROLLER_INPUT.md) |
| Package/game compatibility | [Game compatibility](GAME_COMPATIBILITY.md) |
| Product decisions and unresolved qualification | [Decisions](DECISIONS.md), [Research](RESEARCH.md) |

Documents with dates in their filenames are historical observations, campaign
plans, or status snapshots. Read their dates and claim boundaries before using
their conclusions. A campaign plan is not evidence that the campaign passed.
The current guides above take precedence for routine development; the decision
log retains product authority. Superseded observations and measured benchmarks
remain in place to preserve links and provenance. Rehearsal documents describe
lab models, not native appliance capabilities or user-data administration.

Evidence contracts and their observations live under `benchmarks/`; compliance
artifacts live under `compliance/`. Their validators retain independent safety,
schema and qualification checks. Refresh instructions are in Development.
