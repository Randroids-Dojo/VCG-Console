# Optional Motion capability query

Last updated: 2026-07-24

The optional Motion capability query reports whether one tracker provider can
produce a named optional feature. It lets platform code inspect depth,
segmentation, hands, and future sensor-derived features without adding those
features to the closed Motion `0.4.0` frame profile enum or pretending that
unimplemented data exists.

The query has its own schema version, currently `1`. It is an availability
inventory, not a game permission, hardware qualification, or data transport.

## Known authoring identifiers

The current package exports these convenience constants:

| ID | Meaning when advertised |
|---|---|
| `vcg.sensor.depth` | This provider has a usable depth-data pipeline |
| `vcg.derived.segmentation` | This provider can produce a body/person segmentation result |
| `vcg.derived.hands` | This provider can produce a hand-landmark result |

The list is not an enum. Valid IDs are lowercase namespaced strings, so a future
provider can advertise an ID such as `studio.example.gaze` without changing the
v1 query schema. Matching is exact; suffix, wildcard, and case-folded matching
are prohibited.

Do not advertise `vcg.sensor.depth` merely because a USB device has a depth
sensor. The complete selected provider path must be able to produce usable
depth output. Likewise, an RGB model package on disk is not proof that
segmentation or hands are available in the active provider.

## Inventory

An inventory contains at most 128 exact descriptors:

```json
{
  "schemaVersion": 1,
  "capabilities": [
    {
      "id": "vcg.derived.hands",
      "version": 2,
      "dataProfiles": ["hands.landmarks.v2"]
    }
  ]
}
```

Each descriptor has a positive integer capability revision. Revisions are
monotonic within one exact ID; they are not package versions or semantic-version
ranges. Duplicate IDs fail validation.

`dataProfiles` names the data profiles a future transport could use. These names
are also open namespaced identifiers. They are descriptive inventory only:
listing one does not add it to a Motion frame, grant a manifest permission, or
authorize a bridge session.

The inventory deliberately contains no device serial, USB path, room identity,
raw sensor metadata, calibration secret, or arbitrary provider error text.

## Query and result

A query separates required from optional feature revisions:

```ts
const result = negotiateOptionalMotionCapabilities(inventory, {
  schemaVersion: 1,
  required: [
    { id: "vcg.derived.segmentation", minimumVersion: 1 },
  ],
  optional: [
    { id: "vcg.sensor.depth", minimumVersion: 1 },
    { id: "studio.example.gaze", minimumVersion: 3 },
  ],
});
```

- If any required ID is absent or older than its minimum revision, negotiation
  rejects and returns the complete ordered `missingRequired` list.
- Otherwise, `active` contains exact descriptors for every matching requested
  feature in required-then-optional request order.
- Missing or too-old optional requests appear in `unavailableOptional`.
- Duplicate IDs within either list, an ID appearing in both lists, malformed
  namespaces, non-positive revisions, and an unsupported query schema version
  fail validation.

Unknown object fields are ignored by runtime parsing and permitted by the JSON
schemas. Known discriminators, versions, ID syntax, bounds, and result shapes
remain validated.

## Authority separation

This negotiation never grants access. A game still needs:

1. a permission value in a supported `vcg-game.json` schema;
2. a host grant derived from reviewed, signed package evidence;
3. a versioned Motion data profile and projection rule;
4. a transport that negotiates that profile; and
5. qualification for the selected backend and hardware.

Manifest v1 intentionally has no permission for depth, segmentation, hands, or
future IDs, so an ordinary v1 game cannot consume them even if this inventory
reports provider availability. The current Motion bridge protocol does not
carry this query and Motion frames do not carry these data shapes.

This separation prevents hardware discovery from silently expanding game
authority. It also lets setup, compatibility, and benchmark tooling ask whether
a provider could support a future feature before the data/permission contract
is selected.

## Schemas and evidence

Checked-in Draft 2020-12 schemas are:

- `schemas/motion-capability-inventory.schema.json`
- `schemas/motion-capability-query.schema.json`
- `schemas/motion-capability-negotiation.schema.json`

Tests cover known required/optional negotiation, minimum revisions, missing
required features, optional degradation, duplicate and overlap rejection,
malformed IDs, wrong query versions, ignored future fields, and successful
exact matching of an ID unknown to the current constant list. Generated-schema
tests prove the ID remains a pattern rather than a closed enum.

This closes I-085 as a forward-compatible query contract. It does not claim
that depth, segmentation, or hands are implemented or qualified. Hardware
inventory, live provider adapters, permission/profile versions, bridge/native
transport, privacy review, and identical-backend benchmark evidence remain
future work under I-042, I-045, I-065, I-073, I-075, I-161, and Q-018.
