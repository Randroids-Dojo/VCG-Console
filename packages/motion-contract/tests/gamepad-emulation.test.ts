import { describe, expect, it } from "vitest";
import {
  MOTION_GAMEPAD_MAPPING_DEFINITIONS,
  MOTION_GAMEPAD_PULSE_MS,
  MotionGamepadEmulator,
  MotionGamepadOutputSchema,
  motionGamepadOutputJsonSchema,
  motionGamepadSampleJsonSchema,
  type MotionAction,
  type MotionGamepadMappingId,
  type MotionGamepadSample,
} from "../src";

function action(
  name: MotionAction["name"],
  occurredAtMs: number,
): MotionAction {
  if (["jump", "duck", "dodge_left", "dodge_right"].includes(name)) {
    return { name, phase: "triggered", confidence: 0.9, occurredAtMs };
  }
  return {
    name,
    phase: "triggered",
    confidence: 0.9,
    occurredAtMs,
    durationMs: 500,
  };
}

function sample(
  sequence: number,
  occurredAtMs: number,
  overrides: Partial<MotionGamepadSample> = {},
): MotionGamepadSample {
  return {
    epochId: "research-epoch-1",
    sequence,
    occurredAtMs,
    trackerHealth: "ready",
    playerAuthorized: true,
    leanX: 0,
    actions: [],
    ...overrides,
  };
}

function emulator(mappingId: MotionGamepadMappingId) {
  return new MotionGamepadEmulator({
    epochId: "research-epoch-1",
    gameId: "synthetic-title",
    mappingId,
  });
}

describe("Motion-to-gamepad research adapter", () => {
  it("maps bounded platformer lean and discrete actions", () => {
    const adapter = emulator("platformer-lean-actions-v1");
    const output = adapter.update(
      sample(0, 100, {
        leanX: 0.575,
        actions: [
          action("jump", 100),
          action("duck", 100),
          action("dodge_left", 100),
          action("dodge_right", 100),
        ],
      }),
    );
    expect(output).toMatchObject({
      state: "active",
      releaseReason: null,
      axes: { leftStickX: 0.5 },
      buttons: {
        south: true,
        west: false,
        leftShoulder: true,
        rightShoulder: true,
        dpadDown: true,
      },
      blockedActions: [],
      staleActions: [],
      repeatedActions: [],
    });
  });

  it("applies an exact symmetric lean deadzone and bounded rescaling", () => {
    const adapter = emulator("platformer-lean-actions-v1");
    expect(adapter.update(sample(0, 0, { leanX: 0.15 })).axes.leftStickX).toBe(0);
    expect(adapter.update(sample(1, 1, { leanX: -0.575 })).axes.leftStickX).toBe(-0.5);
    expect(adapter.update(sample(2, 2, { leanX: 1 })).axes.leftStickX).toBe(1);
  });

  it("releases button pulses after the fixed duration", () => {
    const adapter = emulator("platformer-lean-actions-v1");
    expect(
      adapter.update(sample(0, 100, { actions: [action("jump", 100)] })).buttons.south,
    ).toBe(true);
    expect(adapter.update(sample(1, 179)).buttons.south).toBe(true);
    expect(adapter.update(sample(2, 100 + MOTION_GAMEPAD_PULSE_MS)).buttons.south).toBe(
      false,
    );
  });

  it("does not extend a held pulse through repeated event replay", () => {
    const adapter = emulator("platformer-lean-actions-v1");
    adapter.update(sample(0, 100, { actions: [action("jump", 100)] }));
    const repeated = adapter.update(
      sample(1, 120, { actions: [action("jump", 100)] }),
    );
    expect(repeated.buttons.south).toBe(true);
    expect(repeated.repeatedActions).toEqual(["jump"]);
    expect(adapter.update(sample(2, 180)).buttons.south).toBe(false);
  });

  it("drops late actions instead of synthesizing a delayed press", () => {
    const adapter = emulator("platformer-lean-actions-v1");
    const output = adapter.update(
      sample(0, 200, { actions: [action("jump", 100)] }),
    );
    expect(output.buttons.south).toBe(false);
    expect(output.staleActions).toEqual(["jump"]);
  });

  it("blocks shell and reserved actions from the virtual gamepad", () => {
    const adapter = emulator("platformer-lean-actions-v1");
    const output = adapter.update(
      sample(0, 100, {
        actions: [
          action("pause", 100),
          action("menu_back", 100),
          action("menu_select", 100),
        ],
      }),
    );
    expect(output.blockedActions).toEqual(["pause", "menu_back", "menu_select"]);
    expect(Object.values(output.buttons).every((pressed) => !pressed)).toBe(true);
  });

  it("releases every output immediately on health or player-authority loss", () => {
    const health = emulator("platformer-lean-actions-v1");
    health.update(sample(0, 100, { leanX: 1, actions: [action("jump", 100)] }));
    expect(
      health.update(sample(1, 110, { trackerHealth: "degraded", leanX: 1 })),
    ).toMatchObject({
      state: "released",
      releaseReason: "tracker-not-ready",
      axes: { leftStickX: 0 },
      buttons: {
        south: false,
        west: false,
        leftShoulder: false,
        rightShoulder: false,
        dpadDown: false,
      },
    });

    const authority = emulator("arcade-lean-actions-v1");
    authority.update(sample(0, 100, { actions: [action("duck", 100)] }));
    expect(
      authority.update(sample(1, 101, { playerAuthorized: false })),
    ).toMatchObject({
      state: "released",
      releaseReason: "authority-lost",
      buttons: { west: false },
    });
  });

  it("fails closed for racing because continuous throttle and brake are absent", () => {
    const adapter = emulator("racing-steer-only-v1");
    const output = adapter.update(
      sample(0, 100, {
        leanX: 1,
        actions: [action("jump", 100), action("duck", 100)],
      }),
    );
    expect(MOTION_GAMEPAD_MAPPING_DEFINITIONS["racing-steer-only-v1"]).toMatchObject({
      coverage: "incomplete",
      missingFunctions: ["continuous-throttle", "continuous-brake"],
    });
    expect(output).toMatchObject({
      state: "unsupported",
      releaseReason: "mapping-incomplete",
      axes: { leftStickX: 0 },
    });
    expect(Object.values(output.buttons).every((pressed) => !pressed)).toBe(true);
  });

  it("keeps the arcade candidate distinct from the platformer binding", () => {
    const adapter = emulator("arcade-lean-actions-v1");
    const output = adapter.update(
      sample(0, 100, { actions: [action("duck", 100)] }),
    );
    expect(output.buttons.west).toBe(true);
    expect(output.buttons.dpadDown).toBe(false);
  });

  it("rejects replay, epoch substitution, duplicate actions, future events, and unknown fields", () => {
    const sequence = emulator("platformer-lean-actions-v1");
    sequence.update(sample(1, 100));
    expect(() => sequence.update(sample(1, 101))).toThrow("sequence must increase");

    expect(() =>
      emulator("platformer-lean-actions-v1").update(
        sample(0, 0, { epochId: "other-epoch" }),
      ),
    ).toThrow("does not match");

    expect(() =>
      emulator("platformer-lean-actions-v1").update(
        sample(0, 100, {
          actions: [action("jump", 100), action("jump", 100)],
        }),
      ),
    ).toThrow("repeats an action name");

    expect(() =>
      emulator("platformer-lean-actions-v1").update(
        sample(0, 100, { actions: [action("jump", 101)] }),
      ),
    ).toThrow("after its enclosing sample");

    expect(() =>
      emulator("platformer-lean-actions-v1").update({
        ...sample(0, 100),
        // @ts-expect-error adversarial authority field
        allowHome: true,
      }),
    ).toThrow();
  });

  it("exports bounded research-only sample and output schemas", () => {
    const output = emulator("platformer-lean-actions-v1").update(sample(0, 0));
    expect(MotionGamepadOutputSchema.parse(output)).toEqual(output);
    expect(motionGamepadSampleJsonSchema).toMatchObject({
      $id: "urn:vcg:schema:motion-gamepad-sample:1",
      title: "VCG Motion-to-gamepad research sample v1",
    });
    expect(motionGamepadOutputJsonSchema).toMatchObject({
      $id: "urn:vcg:schema:motion-gamepad-output:1",
      title: "VCG Motion-to-gamepad research output v1",
    });
    expect(motionGamepadOutputJsonSchema.$comment).toContain(
      "Home, Back, Pause",
    );
  });
});
