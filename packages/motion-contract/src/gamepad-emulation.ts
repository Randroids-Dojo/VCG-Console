import { z } from "zod";
import { OBSTACLE_ACTION_NAMES } from "./actions";
import {
  MotionActionSchema,
  MotionActionNameSchema,
  TrackerHealthStatusSchema,
  type MotionAction,
} from "./schema";

export const MOTION_GAMEPAD_EMULATION_SCHEMA_VERSION = 1 as const;
export const MOTION_GAMEPAD_PULSE_MS = 80 as const;
export const MOTION_GAMEPAD_LEAN_DEADZONE = 0.15 as const;
export const MAX_MOTION_GAMEPAD_ACTIONS_PER_SAMPLE = 10 as const;

export const MOTION_GAMEPAD_MAPPING_IDS = [
  "platformer-lean-actions-v1",
  "racing-steer-only-v1",
  "arcade-lean-actions-v1",
] as const;

export const VIRTUAL_GAMEPAD_BUTTONS = [
  "south",
  "west",
  "leftShoulder",
  "rightShoulder",
  "dpadDown",
] as const;

const SafeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const MappingIdSchema = z.enum(MOTION_GAMEPAD_MAPPING_IDS);
const VirtualGamepadButtonSchema = z.enum(VIRTUAL_GAMEPAD_BUTTONS);
const ObstacleActionNameSchema = z.enum(OBSTACLE_ACTION_NAMES);

export const MotionGamepadSampleSchema = z.strictObject({
  epochId: SafeIdSchema,
  sequence: z.number().int().nonnegative(),
  occurredAtMs: z.number().finite().nonnegative(),
  trackerHealth: TrackerHealthStatusSchema,
  playerAuthorized: z.boolean(),
  leanX: z.number().finite().min(-1).max(1).nullable(),
  actions: z.array(MotionActionSchema).max(MAX_MOTION_GAMEPAD_ACTIONS_PER_SAMPLE),
});

const VirtualGamepadButtonsSchema = z.strictObject({
  south: z.boolean(),
  west: z.boolean(),
  leftShoulder: z.boolean(),
  rightShoulder: z.boolean(),
  dpadDown: z.boolean(),
});

export const MotionGamepadOutputSchema = z.strictObject({
  schemaVersion: z.literal(MOTION_GAMEPAD_EMULATION_SCHEMA_VERSION),
  mappingId: MappingIdSchema,
  gameId: SafeIdSchema,
  researchOnly: z.literal(true),
  sequence: z.number().int().nonnegative(),
  occurredAtMs: z.number().finite().nonnegative(),
  state: z.enum(["active", "released", "unsupported"]),
  releaseReason: z
    .enum(["tracker-not-ready", "authority-lost", "mapping-incomplete"])
    .nullable(),
  axes: z.strictObject({
    leftStickX: z.number().finite().min(-1).max(1),
  }),
  buttons: VirtualGamepadButtonsSchema,
  blockedActions: z.array(MotionActionNameSchema).max(MAX_MOTION_GAMEPAD_ACTIONS_PER_SAMPLE),
  staleActions: z.array(ObstacleActionNameSchema).max(OBSTACLE_ACTION_NAMES.length),
  repeatedActions: z.array(ObstacleActionNameSchema).max(OBSTACLE_ACTION_NAMES.length),
});

export type MotionGamepadSample = z.infer<typeof MotionGamepadSampleSchema>;
export type MotionGamepadOutput = z.infer<typeof MotionGamepadOutputSchema>;
export type MotionGamepadMappingId = (typeof MOTION_GAMEPAD_MAPPING_IDS)[number];
export type VirtualGamepadButton = (typeof VIRTUAL_GAMEPAD_BUTTONS)[number];

interface MappingDefinition {
  readonly id: MotionGamepadMappingId;
  readonly genre: "platformer" | "racing" | "arcade";
  readonly coverage: "candidate-complete" | "incomplete";
  readonly requiredFunctions: readonly string[];
  readonly missingFunctions: readonly string[];
  readonly usesLeanForLeftStickX: boolean;
  readonly actionButtons: Readonly<
    Partial<Record<(typeof OBSTACLE_ACTION_NAMES)[number], VirtualGamepadButton>>
  >;
}

export const MOTION_GAMEPAD_MAPPING_DEFINITIONS: Readonly<
  Record<MotionGamepadMappingId, MappingDefinition>
> = {
  "platformer-lean-actions-v1": {
    id: "platformer-lean-actions-v1",
    genre: "platformer",
    coverage: "candidate-complete",
    requiredFunctions: ["move-horizontal", "jump", "crouch", "dodge-left", "dodge-right"],
    missingFunctions: [],
    usesLeanForLeftStickX: true,
    actionButtons: {
      jump: "south",
      duck: "dpadDown",
      dodge_left: "leftShoulder",
      dodge_right: "rightShoulder",
    },
  },
  "racing-steer-only-v1": {
    id: "racing-steer-only-v1",
    genre: "racing",
    coverage: "incomplete",
    requiredFunctions: ["steer", "throttle", "brake"],
    missingFunctions: ["continuous-throttle", "continuous-brake"],
    usesLeanForLeftStickX: true,
    actionButtons: {},
  },
  "arcade-lean-actions-v1": {
    id: "arcade-lean-actions-v1",
    genre: "arcade",
    coverage: "candidate-complete",
    requiredFunctions: [
      "move-horizontal",
      "primary-action",
      "secondary-action",
      "left-action",
      "right-action",
    ],
    missingFunctions: [],
    usesLeanForLeftStickX: true,
    actionButtons: {
      jump: "south",
      duck: "west",
      dodge_left: "leftShoulder",
      dodge_right: "rightShoulder",
    },
  },
};

const ZERO_BUTTONS: Readonly<Record<VirtualGamepadButton, boolean>> = {
  south: false,
  west: false,
  leftShoulder: false,
  rightShoulder: false,
  dpadDown: false,
};

/**
 * Camera-free research adapter from an already-authorized player's bounded
 * lean feature and standardized obstacle actions to one title-bound virtual
 * gamepad snapshot.
 *
 * It grants no player/session, manifest, native-device, shell, or reserved
 * input authority. A privileged host must bind the exact title and mapping
 * before constructing it and must release the real virtual device on every
 * adapter fault or context transition.
 */
export class MotionGamepadEmulator {
  readonly #epochId: string;
  readonly #gameId: string;
  readonly #mapping: MappingDefinition;
  readonly #pressedUntil = new Map<VirtualGamepadButton, number>();
  readonly #lastActionTimestamp = new Map<
    (typeof OBSTACLE_ACTION_NAMES)[number],
    number
  >();
  #lastSequence: number | undefined;
  #lastTimestamp: number | undefined;

  constructor(options: {
    epochId: string;
    gameId: string;
    mappingId: MotionGamepadMappingId;
  }) {
    this.#epochId = SafeIdSchema.parse(options.epochId);
    this.#gameId = SafeIdSchema.parse(options.gameId);
    this.#mapping = MOTION_GAMEPAD_MAPPING_DEFINITIONS[MappingIdSchema.parse(
      options.mappingId,
    )];
  }

  update(sampleValue: MotionGamepadSample): MotionGamepadOutput {
    const sample = MotionGamepadSampleSchema.parse(sampleValue);
    if (sample.epochId !== this.#epochId) {
      throw new Error("motion-gamepad sample epoch does not match the bound epoch");
    }
    if (this.#lastSequence !== undefined && sample.sequence <= this.#lastSequence) {
      throw new Error("motion-gamepad sample sequence must increase");
    }
    if (this.#lastTimestamp !== undefined && sample.occurredAtMs < this.#lastTimestamp) {
      throw new Error("motion-gamepad sample time must not regress");
    }
    assertUniqueActionNames(sample.actions);
    for (const [actionIndex, action] of sample.actions.entries()) {
      if (action.occurredAtMs > sample.occurredAtMs) {
        throw new Error(
          `motion-gamepad action ${actionIndex} occurs after its enclosing sample`,
        );
      }
    }

    this.#lastSequence = sample.sequence;
    this.#lastTimestamp = sample.occurredAtMs;
    this.#expirePulses(sample.occurredAtMs);

    if (this.#mapping.coverage === "incomplete") {
      this.#pressedUntil.clear();
      return this.#output(sample, "unsupported", "mapping-incomplete", 0, [], [], []);
    }
    if (sample.trackerHealth !== "ready") {
      this.#pressedUntil.clear();
      return this.#output(sample, "released", "tracker-not-ready", 0, [], [], []);
    }
    if (!sample.playerAuthorized) {
      this.#pressedUntil.clear();
      return this.#output(sample, "released", "authority-lost", 0, [], [], []);
    }

    const blockedActions: MotionAction["name"][] = [];
    const staleActions: (typeof OBSTACLE_ACTION_NAMES)[number][] = [];
    const repeatedActions: (typeof OBSTACLE_ACTION_NAMES)[number][] = [];
    for (const action of sample.actions) {
      if (!isObstacleAction(action)) {
        blockedActions.push(action.name);
        continue;
      }
      const button = this.#mapping.actionButtons[action.name];
      if (!button) {
        blockedActions.push(action.name);
        continue;
      }
      const previous = this.#lastActionTimestamp.get(action.name);
      if (previous !== undefined && action.occurredAtMs <= previous) {
        repeatedActions.push(action.name);
        continue;
      }
      this.#lastActionTimestamp.set(action.name, action.occurredAtMs);
      const pressedUntil = action.occurredAtMs + MOTION_GAMEPAD_PULSE_MS;
      if (pressedUntil <= sample.occurredAtMs) {
        staleActions.push(action.name);
        continue;
      }
      if ((this.#pressedUntil.get(button) ?? 0) <= sample.occurredAtMs) {
        this.#pressedUntil.set(button, pressedUntil);
      }
    }

    return this.#output(
      sample,
      "active",
      null,
      sample.leanX === null ? 0 : normalizeLean(sample.leanX),
      blockedActions,
      staleActions,
      repeatedActions,
    );
  }

  #expirePulses(nowMs: number): void {
    for (const [button, pressedUntil] of this.#pressedUntil) {
      if (pressedUntil <= nowMs) this.#pressedUntil.delete(button);
    }
  }

  #output(
    sample: MotionGamepadSample,
    state: MotionGamepadOutput["state"],
    releaseReason: MotionGamepadOutput["releaseReason"],
    leftStickX: number,
    blockedActions: MotionAction["name"][],
    staleActions: (typeof OBSTACLE_ACTION_NAMES)[number][],
    repeatedActions: (typeof OBSTACLE_ACTION_NAMES)[number][],
  ): MotionGamepadOutput {
    const buttons = { ...ZERO_BUTTONS };
    for (const button of this.#pressedUntil.keys()) buttons[button] = true;
    return MotionGamepadOutputSchema.parse({
      schemaVersion: MOTION_GAMEPAD_EMULATION_SCHEMA_VERSION,
      mappingId: this.#mapping.id,
      gameId: this.#gameId,
      researchOnly: true,
      sequence: sample.sequence,
      occurredAtMs: sample.occurredAtMs,
      state,
      releaseReason,
      axes: { leftStickX },
      buttons,
      blockedActions,
      staleActions,
      repeatedActions,
    });
  }
}

function assertUniqueActionNames(actions: readonly MotionAction[]): void {
  const names = new Set<MotionAction["name"]>();
  for (const action of actions) {
    if (names.has(action.name)) {
      throw new Error("motion-gamepad sample repeats an action name");
    }
    names.add(action.name);
  }
}

function isObstacleAction(
  action: MotionAction,
): action is MotionAction & {
  name: (typeof OBSTACLE_ACTION_NAMES)[number];
  phase: "triggered";
} {
  return OBSTACLE_ACTION_NAMES.some((name) => name === action.name);
}

function normalizeLean(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= MOTION_GAMEPAD_LEAN_DEADZONE) return 0;
  const normalized =
    Math.sign(value) *
    Math.min(
      1,
      (magnitude - MOTION_GAMEPAD_LEAN_DEADZONE) /
        (1 - MOTION_GAMEPAD_LEAN_DEADZONE),
    );
  return Math.round(normalized * 10_000) / 10_000;
}

const forwardCompatibleJsonSchemaOptions = {
  target: "draft-2020-12" as const,
  override: ({ jsonSchema }: { jsonSchema: Record<string, unknown> }) => {
    if (jsonSchema.additionalProperties === false) delete jsonSchema.additionalProperties;
  },
};

export const motionGamepadSampleJsonSchema = z.toJSONSchema(
  MotionGamepadSampleSchema,
  forwardCompatibleJsonSchemaOptions,
) as Record<string, unknown>;
motionGamepadSampleJsonSchema.$id = "urn:vcg:schema:motion-gamepad-sample:1";
motionGamepadSampleJsonSchema.title = "VCG Motion-to-gamepad research sample v1";
motionGamepadSampleJsonSchema.$comment =
  "Research input only. It grants no player, manifest, native-device, game, shell, or reserved-input authority.";

export const motionGamepadOutputJsonSchema = z.toJSONSchema(
  MotionGamepadOutputSchema,
  forwardCompatibleJsonSchemaOptions,
) as Record<string, unknown>;
motionGamepadOutputJsonSchema.$id = "urn:vcg:schema:motion-gamepad-output:1";
motionGamepadOutputJsonSchema.title = "VCG Motion-to-gamepad research output v1";
motionGamepadOutputJsonSchema.$comment =
  "Research output only. Home, Back, Pause, and shell actions are never virtual-gamepad bindings.";
