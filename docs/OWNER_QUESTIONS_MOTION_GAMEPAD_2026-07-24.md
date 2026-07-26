# Owner questions: Motion-to-gamepad emulation

The camera-free adapter can expose software constraints without choosing which
games, mappings, participants, or product claims are acceptable.

## Q-239: exact three-game play campaign and mapping authority

Which exact rights-cleared platformer, racing, and simple arcade game builds
should I-071 test; which per-title lean/action bindings may the trusted host
authorize; and what task-completion, false/missed input, full latency,
comfort/fatigue, accessibility, controller-recovery, and reserved-input gates
must each game pass?

Safe default: keep Motion-to-gamepad disabled in catalog and production
launches. Do not expose the incomplete racing mapping. Require a
signed/versioned host-owned mapping, a target-native virtual device that
releases on every fault/context transition, an independent physical
controller recovery path, both Linux tiers, and consented separately reported
play sessions. Never deliver Home, Back, Pause, Join, Select, or Swipe as game
buttons, never let a game select its own mapping, and never call authored
function coverage a playability, latency, comfort, or accessibility result.
