# Canonical controller mapping contract

Status: strict software contract implemented; native device integration and UX
unqualified

Last updated: 2026-07-24

VCG promises standards-conformant controllers should normally work without
manual setup while ambiguous devices remain recoverable with a controller-only
guided mapper. A mapping is host-owned input policy, not authority supplied by
a game.

## Implemented profile

The strict v1 mapping profile binds:

- opaque mapping ID and positive revision;
- exact lowercase SDL GUID plus USB vendor/product IDs;
- `console-and-consenting-games` scope;
- the fixed host-owned reserved-action declaration `Home`, `Back`, `Pause`;
  and
- unique, action-sorted physical-control bindings.

Physical vocabulary is bounded to buttons 0–31, directional halves of axes
0–7, and four directions on hats 0–3. The profile must bind navigation up,
down, left and right plus confirm exactly once. Optional ordinary actions are
primary, secondary, and left/right shoulder.

The schema rejects device display names, paths, arbitrary key names, unknown
fields, duplicate controls, duplicate actions, missing shell actions, unsafe
IDs, malformed device identities, and ambiguous ordering.

## Snapshot projection

Only an exact parsed profile is authority. Each physical snapshot must repeat
the same mapping ID/revision, carry a positive connection epoch, and contain
unique bounded controls. Projection returns sorted ordinary actions and
separately sorted valid-but-unmapped controls.

`reservedActionsEmitted` is structurally fixed to an empty tuple. Home, Back,
and Pause are not values in the ordinary-action vocabulary, so neither a
profile nor a physical snapshot can synthesize them. The existing native
reserved-input router remains responsible for their console-owned path.

Mapping output is deeply frozen. It contains no device name, player/profile
identity, path, game command, keyboard key, executable authority, or free
text.

## Evidence

Nine focused tests cover:

- complete shell projection and deterministic ordering;
- unmapped-control reporting without invention;
- required and unique shell actions;
- duplicate controls and ordering;
- reserved-action exclusion;
- mapping ID/revision substitution;
- clone, duplicate-sample, and unknown-field rejection;
- unsafe control/device identity; and
- exact reserved-action declaration.

The Motion-contract package now has 187 passing tests and strict typechecking.

## Remaining boundary

I-128 remains active. Product completion requires the selected SDL/Steam Input
mapping database and update owner; actual controller GUID/revision evidence;
native adapter integration; hot-plug/reconnect and multi-controller behavior;
a controller-only ambiguous-device mapper; persistent mapping storage,
signing/versioning and rollback; generic glyph policy; accessible reset when a
mapping is broken; per-game remap limits and UX; physical representative
Xbox/PlayStation/8BitDo/generic testing; and target Linux/SteamOS evidence.
