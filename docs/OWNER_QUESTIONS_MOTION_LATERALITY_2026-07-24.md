# Owner questions: motion laterality

Date: 2026-07-24

The camera-free laterality comparison is complete without this answer. The
question gates player-visible failure behavior and game authority. No answer
is assumed.

## Q-233: directional ambiguity failure scope

When anatomical left/right becomes ambiguous for one player, should VCG
suppress only affected directional controls or freeze the complete active
game?

The generated comparison shows a useful distinction:

- missing one wrist can leave the opposite-side Reach independently usable;
- a complete named torso-axis reversal or strong profile view makes every
  directional label unsafe;
- non-directional Jump/Squat may still have their required landmarks; and
- distal-only swaps can escape the torso guard, so real backend qualification
  remains necessary even with suppression.

Safe default:

- suppress and visibly mark only directional controls when the torso
  laterality guard blocks;
- cancel their in-progress holds and require fresh rearming;
- keep a non-directional control available only when its own required
  landmarks, tracker health, player identity, and game policy remain
  qualified;
- expose immediate controller recovery;
- freeze the whole shared game if identity is lost, tracker health is not
  ready, the title declares directional control essential, or more than one
  joined player could receive unsafe authority;
- never relabel left/right from screen position; and
- log only bounded skeleton/control state, never frames.

If whole-game freeze should be unconditional, please confirm whether that
applies to one-player games as well as the already selected multiplayer
freeze semantics. If selective suppression is acceptable, each game manifest
or action profile needs to declare whether loss of directional controls is
continuable or blocking.
