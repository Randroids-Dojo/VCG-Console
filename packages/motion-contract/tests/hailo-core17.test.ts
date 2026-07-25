import { describe, expect, it } from "vitest";
import {
  CORE_LANDMARK_NAMES,
  HAILO_CORE17_INPUT_VERSION,
  MAX_HAILO_INPUT_PEOPLE,
  MotionFrameSchema,
  MotionSourceSchema,
  projectHailoCore17,
  type HailoCore17BatchObservation,
  type HailoCore17PersonObservation,
} from "../src";

function person(
  score = 0.9,
  offset = 0,
): HailoCore17PersonObservation {
  return {
    landmarks: CORE_LANDMARK_NAMES.map((name, index) => ({
      name,
      x: index / 20 + offset,
      y: index / 40 + offset,
      score,
    })),
  };
}

function batch(
  people: readonly HailoCore17PersonObservation[],
): HailoCore17BatchObservation {
  return {
    schemaVersion: HAILO_CORE17_INPUT_VERSION,
    people,
  };
}

describe("projectHailoCore17", () => {
  it("maps the exact named COCO-17 order without fabricating richer profiles", () => {
    const projection = projectHailoCore17(batch([person()]), {
      maxPlayers: 4,
    });

    expect(projection).toMatchObject({
      schemaVersion: "hailo-core17-projection/v1",
      backend: "hailo",
      motionFrameEmission: "blocked-pending-honest-source",
      coordinateSpecVersion: "0.1.0",
      coordinateSystem: "image.normalized.top-left",
      availableProfiles: ["body.core17"],
      unavailableProfiles: [
        "body.mediapipe33",
        "body.world3d",
        "actions.obstacle.v1",
        "actions.shell.v1",
      ],
    });
    expect(
      projection.players[0]?.coreLandmarks.map(({ name }) => name),
    ).toEqual(CORE_LANDMARK_NAMES);
    expect(projection.players[0]?.coreLandmarks[16]?.position).toEqual({
      x: 0.8,
      y: 0.4,
    });
    expect(projection.players[0]?.actions).toEqual([]);
    expect(MotionFrameSchema.safeParse(projection).success).toBe(false);
    expect(MotionSourceSchema.safeParse("hailo-native").success).toBe(false);
  });

  it("filters all-zero and below-threshold no-observation candidates", () => {
    for (const score of [0, 0.24]) {
      const projection = projectHailoCore17(batch([person(score)]), {
        maxPlayers: 1,
      });
      expect(projection.players).toEqual([]);
    }
  });

  it("ranks by mean score, bounds output, and preserves source-index identity", () => {
    const projection = projectHailoCore17(
      batch([person(0.5), person(0.9, 0.01), person(0.7, 0.02)]),
      { maxPlayers: 2 },
    );
    expect(
      projection.players.map(({ id, sessionSlot }) => ({
        id,
        sessionSlot,
      })),
    ).toEqual([
      { id: "candidate-2", sessionSlot: 1 },
      { id: "candidate-3", sessionSlot: 2 },
    ]);
    expect(projection.players[0]?.confidence).toBeCloseTo(0.9);
    expect(projection.players[1]?.confidence).toBeCloseTo(0.7);
  });

  it("uses only observed points for bounds and preserves finite out-of-frame coordinates", () => {
    const baseline = person(0.1);
    const landmarks = baseline.landmarks.map((landmark) => ({ ...landmark }));
    landmarks[0] = {
      ...landmarks[0]!,
      x: -0.1,
      y: 1.2,
      score: 0.8,
    };
    landmarks[1] = {
      ...landmarks[1]!,
      x: 0.5,
      y: 0.4,
      score: 0.7,
    };
    const projection = projectHailoCore17(
      batch([{ ...baseline, landmarks }]),
      { maxPlayers: 1, observedScoreThreshold: 0.5 },
    );
    expect(projection.players[0]?.coreLandmarks[0]).toMatchObject({
      position: { x: -0.1, y: 1.2 },
      visibility: 0.8,
      observed: true,
    });
    expect(projection.players[0]?.coreLandmarks[2]?.observed).toBe(false);
    expect(projection.players[0]?.bounds).toEqual({
      left: -0.1,
      top: 0.4,
      right: 0.5,
      bottom: 1.2,
    });
  });

  it("uses source order as the deterministic tie break", () => {
    const projection = projectHailoCore17(
      batch([person(0.8, 0.01), person(0.8, 0.02)]),
      { maxPlayers: 2 },
    );
    expect(projection.players.map(({ id }) => id)).toEqual([
      "candidate-1",
      "candidate-2",
    ]);
  });

  it.each([
    [
      "unknown person field",
      batch([{ ...person(), displayName: "not allowed" } as never]),
    ],
    [
      "wrong input version",
      { ...batch([person()]), schemaVersion: "hailo-coco17-normalized/v2" },
    ],
    [
      "missing landmark",
      batch([{ ...person(), landmarks: person().landmarks.slice(1) }]),
    ],
    [
      "wrong landmark order",
      batch([
        {
          ...person(),
          landmarks: person().landmarks.map((landmark, index) =>
            index === 0
              ? { ...landmark, name: CORE_LANDMARK_NAMES[1] }
              : landmark,
          ),
        },
      ]),
    ],
    [
      "unknown landmark field",
      batch([
        {
          ...person(),
          landmarks: person().landmarks.map((landmark, index) =>
            index === 0 ? { ...landmark, z: 0 } : landmark,
          ),
        },
      ]),
    ],
    [
      "non-finite coordinate",
      batch([
        {
          ...person(),
          landmarks: person().landmarks.map((landmark, index) =>
            index === 0 ? { ...landmark, x: Number.NaN } : landmark,
          ),
        },
      ]),
    ],
    [
      "out-of-range score",
      batch([
        {
          ...person(),
          landmarks: person().landmarks.map((landmark, index) =>
            index === 0 ? { ...landmark, score: 1.1 } : landmark,
          ),
        },
      ]),
    ],
  ])("rejects malformed normalized input: %s", (_, malformed) => {
    expect(() => projectHailoCore17(malformed, { maxPlayers: 1 })).toThrow();
  });

  it("rejects non-arrays, excessive observations, and unsafe options", () => {
    expect(() => projectHailoCore17([], { maxPlayers: 1 })).toThrow(
      "plain object",
    );
    expect(() =>
      projectHailoCore17(
        { ...batch([]), portrait: "not allowed" },
        { maxPlayers: 1 },
      ),
    ).toThrow("unknown fields");
    expect(() =>
      projectHailoCore17(
        { ...batch([]), people: {} },
        { maxPlayers: 1 },
      ),
    ).toThrow("must be an array");
    expect(() =>
      projectHailoCore17(
        batch(
          Array.from(
            { length: MAX_HAILO_INPUT_PEOPLE + 1 },
            () => person(),
          ),
        ),
        { maxPlayers: 1 },
      ),
    ).toThrow(`cannot exceed ${MAX_HAILO_INPUT_PEOPLE}`);
    expect(() =>
      projectHailoCore17(batch([]), { maxPlayers: 0 }),
    ).toThrow();
    expect(() =>
      projectHailoCore17(batch([]), { maxPlayers: 5 }),
    ).toThrow();
    expect(() =>
      projectHailoCore17(batch([]), {
        maxPlayers: 1,
        observedScoreThreshold: 0,
      }),
    ).toThrow();
    expect(() =>
      projectHailoCore17(batch([]), {
        maxPlayers: 1,
        observedScoreThreshold: 1.1,
      }),
    ).toThrow();
    expect(() =>
      projectHailoCore17(batch([]), {
        maxPlayers: 1,
        debug: true,
      } as never),
    ).toThrow("unknown fields");

    const sparse = new Array(1);
    expect(() =>
      projectHailoCore17(
        { ...batch([]), people: sparse },
        { maxPlayers: 1 },
      ),
    ).toThrow("dense array");
    const withArrayField = [person()] as HailoCore17PersonObservation[] & {
      debug?: boolean;
    };
    withArrayField.debug = true;
    expect(() =>
      projectHailoCore17(
        { ...batch([]), people: withArrayField },
        { maxPlayers: 1 },
      ),
    ).toThrow("unknown fields");
  });

  it("requires the input version even for an empty detection batch", () => {
    expect(
      projectHailoCore17(batch([]), { maxPlayers: 1 }).players,
    ).toEqual([]);
    expect(() =>
      projectHailoCore17(
        { people: [] },
        { maxPlayers: 1 },
      ),
    ).toThrow("missing or unknown fields");
  });

  it("does not mutate frozen input", () => {
    const frozenPerson = Object.freeze({
      ...person(),
      landmarks: Object.freeze(
        person().landmarks.map((landmark) => Object.freeze({ ...landmark })),
      ),
    });
    const frozenBatch = Object.freeze({
      ...batch([]),
      people: Object.freeze([frozenPerson]),
    });
    expect(() =>
      projectHailoCore17(frozenBatch, { maxPlayers: 1 }),
    ).not.toThrow();
  });
});
