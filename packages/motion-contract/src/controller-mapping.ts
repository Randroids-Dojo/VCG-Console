import { z } from "zod";

export const CONTROLLER_MAPPING_SCHEMA_VERSION = 1 as const;
export const CONTROLLER_RESERVED_ACTIONS = [
  "home",
  "back",
  "pause",
] as const;
export const CONTROLLER_ORDINARY_ACTIONS = [
  "navigate-up",
  "navigate-down",
  "navigate-left",
  "navigate-right",
  "confirm",
  "primary",
  "secondary",
  "left-shoulder",
  "right-shoulder",
] as const;
export const CONTROLLER_REQUIRED_SHELL_ACTIONS = [
  "navigate-up",
  "navigate-down",
  "navigate-left",
  "navigate-right",
  "confirm",
] as const;

const SafeId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(64);
const PhysicalControl = z
  .string()
  .regex(
    /^(?:button:(?:[0-9]|[12][0-9]|3[01])|axis:[0-7]:(?:negative|positive)|hat:[0-3]:(?:up|down|left|right))$/u,
  );
const OrdinaryAction = z.enum(CONTROLLER_ORDINARY_ACTIONS);

export const ControllerMappingProfileSchema = z
  .strictObject({
    schemaVersion: z.literal(CONTROLLER_MAPPING_SCHEMA_VERSION),
    mappingId: SafeId,
    revision: z.number().int().positive(),
    device: z.strictObject({
      sdlGuid: z.string().regex(/^[a-f0-9]{32}$/u),
      vendorId: z.string().regex(/^[a-f0-9]{4}$/u),
      productId: z.string().regex(/^[a-f0-9]{4}$/u),
    }),
    scope: z.literal("console-and-consenting-games"),
    reservedActionsOwnedByHost: z.tuple([
      z.literal("home"),
      z.literal("back"),
      z.literal("pause"),
    ]),
    bindings: z
      .array(
        z.strictObject({
          control: PhysicalControl,
          action: OrdinaryAction,
        }),
      )
      .min(CONTROLLER_REQUIRED_SHELL_ACTIONS.length)
      .max(CONTROLLER_ORDINARY_ACTIONS.length),
  })
  .superRefine((profile, context) => {
    const controls = profile.bindings.map(({ control }) => control);
    const actions = profile.bindings.map(({ action }) => action);
    if (new Set(controls).size !== controls.length) {
      context.addIssue({
        code: "custom",
        path: ["bindings"],
        message: "physical controls must be unique",
      });
    }
    if (new Set(actions).size !== actions.length) {
      context.addIssue({
        code: "custom",
        path: ["bindings"],
        message: "ordinary actions must be unique",
      });
    }
    for (const action of CONTROLLER_REQUIRED_SHELL_ACTIONS) {
      if (!actions.includes(action)) {
        context.addIssue({
          code: "custom",
          path: ["bindings"],
          message: `required shell action ${action} is missing`,
        });
      }
    }
    if (
      profile.bindings.some(
        ({ action }, index) =>
          index > 0 && profile.bindings[index - 1]!.action >= action,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["bindings"],
        message: "bindings must be strictly action-sorted",
      });
    }
  });

export const ControllerPhysicalSnapshotSchema = z.strictObject({
  mappingId: SafeId,
  mappingRevision: z.number().int().positive(),
  connectionEpoch: z.number().int().positive(),
  pressedControls: z.array(PhysicalControl).max(32),
});

export const ControllerMappedSnapshotSchema = z.strictObject({
  mappingId: SafeId,
  mappingRevision: z.number().int().positive(),
  connectionEpoch: z.number().int().positive(),
  actions: z.array(OrdinaryAction).max(CONTROLLER_ORDINARY_ACTIONS.length),
  unmappedControls: z.array(PhysicalControl).max(32),
  reservedActionsEmitted: z.tuple([]),
});

export type ControllerMappingProfile = z.infer<
  typeof ControllerMappingProfileSchema
>;
export type ControllerPhysicalSnapshot = z.infer<
  typeof ControllerPhysicalSnapshotSchema
>;
export type ControllerMappedSnapshot = z.infer<
  typeof ControllerMappedSnapshotSchema
>;

const authorities = new WeakSet<object>();

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function parseControllerMappingProfile(
  value: unknown,
): ControllerMappingProfile {
  const profile = deepFreeze(ControllerMappingProfileSchema.parse(value));
  authorities.add(profile);
  return profile;
}

export function mapControllerSnapshot(
  profile: ControllerMappingProfile,
  snapshotValue: ControllerPhysicalSnapshot,
): ControllerMappedSnapshot {
  if (!authorities.has(profile)) {
    throw new Error("controller mapping must be an exact parsed authority");
  }
  const snapshot = ControllerPhysicalSnapshotSchema.parse(snapshotValue);
  if (
    snapshot.mappingId !== profile.mappingId
    || snapshot.mappingRevision !== profile.revision
  ) {
    throw new Error("controller snapshot mapping authority does not match");
  }
  if (new Set(snapshot.pressedControls).size !== snapshot.pressedControls.length) {
    throw new Error("controller snapshot repeats a physical control");
  }
  const bindings = new Map(
    profile.bindings.map(({ control, action }) => [control, action]),
  );
  const actions: (typeof CONTROLLER_ORDINARY_ACTIONS)[number][] = [];
  const unmappedControls: string[] = [];
  for (const control of snapshot.pressedControls) {
    const action = bindings.get(control);
    if (action) actions.push(action);
    else unmappedControls.push(control);
  }
  actions.sort();
  unmappedControls.sort();
  return deepFreeze(
    ControllerMappedSnapshotSchema.parse({
      mappingId: profile.mappingId,
      mappingRevision: profile.revision,
      connectionEpoch: snapshot.connectionEpoch,
      actions,
      unmappedControls,
      reservedActionsEmitted: [],
    }),
  );
}
