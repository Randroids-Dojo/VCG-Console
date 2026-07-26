import { z } from "zod";

export const STEAM_INPUT_ACTION_CONTRACT_SCHEMA_VERSION = 1 as const;
export const STEAM_INPUT_ACTION_SET_IDS = [
  "vcg-shell",
  "vcg-game",
  "vcg-console-overlay",
] as const;
export const STEAM_INPUT_LAYER_IDS = ["vcg-text-entry"] as const;
export const STEAM_INPUT_RESERVED_ACTION_IDS = [
  "home",
  "back",
  "pause",
] as const;
export const STEAM_INPUT_ORDINARY_ACTION_IDS = [
  "navigate-up",
  "navigate-down",
  "navigate-left",
  "navigate-right",
  "confirm",
  "request-text-entry",
  "primary",
  "secondary",
  "left-shoulder",
  "right-shoulder",
  "move",
  "look",
] as const;

const SafeId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(64);
const SteamActionName = z.string().regex(/^vcg_[a-z0-9]+(?:_[a-z0-9]+)*$/u).max(64);

const digitalBinding = (
  steamActionName: string,
  actionId: (typeof STEAM_INPUT_ORDINARY_ACTION_IDS)[number],
) =>
  z.strictObject({
    steamActionName: z.literal(steamActionName),
    actionId: z.literal(actionId),
    valueType: z.literal("digital"),
  });

const analogBinding = (
  steamActionName: string,
  actionId: "move" | "look",
  inputMode: "joystick-move" | "absolute-mouse",
) =>
  z.strictObject({
    steamActionName: z.literal(steamActionName),
    actionId: z.literal(actionId),
    valueType: z.literal("analog-2d"),
    inputMode: z.literal(inputMode),
  });

const ShellActionSetSchema = z.strictObject({
  actionSetId: z.literal("vcg-shell"),
  steamActionSetName: z.literal("VCG_Shell"),
  context: z.literal("launcher-and-shell"),
  digitalActions: z.tuple([
    digitalBinding("vcg_navigate_up", "navigate-up"),
    digitalBinding("vcg_navigate_down", "navigate-down"),
    digitalBinding("vcg_navigate_left", "navigate-left"),
    digitalBinding("vcg_navigate_right", "navigate-right"),
    digitalBinding("vcg_confirm", "confirm"),
    digitalBinding("vcg_request_text_entry", "request-text-entry"),
  ]),
  analogActions: z.tuple([]),
});

const GameActionSetSchema = z.strictObject({
  actionSetId: z.literal("vcg-game"),
  steamActionSetName: z.literal("VCG_Game"),
  context: z.literal("consenting-game"),
  digitalActions: z.tuple([
    digitalBinding("vcg_primary", "primary"),
    digitalBinding("vcg_secondary", "secondary"),
    digitalBinding("vcg_left_shoulder", "left-shoulder"),
    digitalBinding("vcg_right_shoulder", "right-shoulder"),
  ]),
  analogActions: z.tuple([
    analogBinding("vcg_move", "move", "joystick-move"),
    analogBinding("vcg_look", "look", "absolute-mouse"),
  ]),
});

const OverlayActionSetSchema = z.strictObject({
  actionSetId: z.literal("vcg-console-overlay"),
  steamActionSetName: z.literal("VCG_Console_Overlay"),
  context: z.literal("host-owned-overlay"),
  digitalActions: z.tuple([
    digitalBinding("vcg_overlay_up", "navigate-up"),
    digitalBinding("vcg_overlay_down", "navigate-down"),
    digitalBinding("vcg_overlay_left", "navigate-left"),
    digitalBinding("vcg_overlay_right", "navigate-right"),
    digitalBinding("vcg_overlay_confirm", "confirm"),
  ]),
  analogActions: z.tuple([]),
});

export const SteamInputActionContractSchema = z.strictObject({
  schemaVersion: z.literal(STEAM_INPUT_ACTION_CONTRACT_SCHEMA_VERSION),
  contractId: SafeId,
  disposition: z.literal("optional-steam-input-adapter"),
  baseInputAuthority: z.literal("sdl-or-normal-linux-input"),
  steamAccountRequiredForCoreOperation: z.literal(false),
  actionSets: z.tuple([
    ShellActionSetSchema,
    GameActionSetSchema,
    OverlayActionSetSchema,
  ]),
  actionSetLayers: z.tuple([
    z.strictObject({
      layerId: z.literal("vcg-text-entry"),
      steamLayerName: z.literal("VCG_Text_Entry"),
      parentActionSetId: z.literal("vcg-shell"),
      context: z.literal("controller-text-entry"),
      hostOwned: z.literal(true),
      gameActionDeliveryAllowed: z.literal(false),
    }),
  ]),
  reservedActionBoundary: z.strictObject({
    actionIds: z.tuple([
      z.literal("home"),
      z.literal("back"),
      z.literal("pause"),
    ]),
    authority: z.literal("host-or-compositor-only"),
    steamActionMayBeSoleAuthority: z.literal(false),
    remappable: z.literal(false),
    deliverableToGame: z.literal(false),
    legacyEmulationAllowed: z.literal(false),
  }),
  textEntryBoundary: z.strictObject({
    requestActionId: z.literal("request-text-entry"),
    provider: z.literal("steamutils-show-gamepad-text-input"),
    layerIdWhileOpen: z.literal("vcg-text-entry"),
    controllerOnlyConfirmAndCancelRequired: z.literal(true),
    steamAccountRequired: z.literal(false),
    enteredTextMayEnterDiagnosticsOrEvidence: z.literal(false),
  }),
  glyphBoundary: z.strictObject({
    source: z.literal("steam-action-origin-when-available"),
    safeGenericFallbackRequired: z.literal(true),
    brandedGlyphMayBeGuessed: z.literal(false),
    freeTextDeviceNameAllowed: z.literal(false),
  }),
  unknownControllerBoundary: z.strictObject({
    standardsConformantControllersRemainWithinPromise: z.literal(true),
    zeroSetupCanonicalDefaultsRequired: z.literal(true),
    ambiguousMappingAuthority: z.literal("none-until-guided-mapping"),
    guidedMappingMustBeControllerOnly: z.literal(true),
    reservedActionsMayBeGuessed: z.literal(false),
    unsupportedOrAmbiguousMayCountAsCompatibility: z.literal(false),
  }),
  legacyModeBoundary: z.strictObject({
    permittedForDeclaredCompatibilityOnly: z.literal(true),
    mayQualifyNativeActionIntegration: z.literal(false),
    mixedMouseKeyboardAndGamepadMustBeTested: z.literal(true),
    matchingGlyphsMayBeAssumed: z.literal(false),
    ordinaryEmulationClasses: z.tuple([
      z.literal("gamepad"),
      z.literal("keyboard"),
      z.literal("mouse"),
    ]),
    reservedActionEmulationAllowed: z.literal(false),
  }),
});

export type SteamInputActionContract = z.infer<
  typeof SteamInputActionContractSchema
>;

const authorities = new WeakSet<object>();

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function assertUniqueActionNames(contract: SteamInputActionContract): void {
  const names = contract.actionSets.flatMap((set) => [
    ...set.digitalActions.map(({ steamActionName }) => steamActionName),
    ...set.analogActions.map(({ steamActionName }) => steamActionName),
  ]);
  if (!names.every((name) => SteamActionName.safeParse(name).success)) {
    throw new Error("Steam action names must use the closed vcg_ identifier form");
  }
  if (new Set(names).size !== names.length) {
    throw new Error("Steam action names must be globally unique");
  }
  const ordinary = contract.actionSets.flatMap((set) => [
    ...set.digitalActions.map(({ actionId }) => actionId),
    ...set.analogActions.map(({ actionId }) => actionId),
  ]);
  for (const reserved of STEAM_INPUT_RESERVED_ACTION_IDS) {
    if ((ordinary as readonly string[]).includes(reserved)) {
      throw new Error(`reserved action ${reserved} cannot be an ordinary action`);
    }
  }
}

export function parseSteamInputActionContract(
  value: unknown,
): SteamInputActionContract {
  const contract = SteamInputActionContractSchema.parse(value);
  assertUniqueActionNames(contract);
  const frozen = deepFreeze(contract);
  authorities.add(frozen);
  return frozen;
}

export function isParsedSteamInputActionContract(
  value: SteamInputActionContract,
): boolean {
  return authorities.has(value);
}

export const VCG_STEAM_INPUT_ACTION_CONTRACT =
  parseSteamInputActionContract({
    schemaVersion: 1,
    contractId: "vcg-steam-input-actions-v1",
    disposition: "optional-steam-input-adapter",
    baseInputAuthority: "sdl-or-normal-linux-input",
    steamAccountRequiredForCoreOperation: false,
    actionSets: [
      {
        actionSetId: "vcg-shell",
        steamActionSetName: "VCG_Shell",
        context: "launcher-and-shell",
        digitalActions: [
          {
            steamActionName: "vcg_navigate_up",
            actionId: "navigate-up",
            valueType: "digital",
          },
          {
            steamActionName: "vcg_navigate_down",
            actionId: "navigate-down",
            valueType: "digital",
          },
          {
            steamActionName: "vcg_navigate_left",
            actionId: "navigate-left",
            valueType: "digital",
          },
          {
            steamActionName: "vcg_navigate_right",
            actionId: "navigate-right",
            valueType: "digital",
          },
          {
            steamActionName: "vcg_confirm",
            actionId: "confirm",
            valueType: "digital",
          },
          {
            steamActionName: "vcg_request_text_entry",
            actionId: "request-text-entry",
            valueType: "digital",
          },
        ],
        analogActions: [],
      },
      {
        actionSetId: "vcg-game",
        steamActionSetName: "VCG_Game",
        context: "consenting-game",
        digitalActions: [
          {
            steamActionName: "vcg_primary",
            actionId: "primary",
            valueType: "digital",
          },
          {
            steamActionName: "vcg_secondary",
            actionId: "secondary",
            valueType: "digital",
          },
          {
            steamActionName: "vcg_left_shoulder",
            actionId: "left-shoulder",
            valueType: "digital",
          },
          {
            steamActionName: "vcg_right_shoulder",
            actionId: "right-shoulder",
            valueType: "digital",
          },
        ],
        analogActions: [
          {
            steamActionName: "vcg_move",
            actionId: "move",
            valueType: "analog-2d",
            inputMode: "joystick-move",
          },
          {
            steamActionName: "vcg_look",
            actionId: "look",
            valueType: "analog-2d",
            inputMode: "absolute-mouse",
          },
        ],
      },
      {
        actionSetId: "vcg-console-overlay",
        steamActionSetName: "VCG_Console_Overlay",
        context: "host-owned-overlay",
        digitalActions: [
          {
            steamActionName: "vcg_overlay_up",
            actionId: "navigate-up",
            valueType: "digital",
          },
          {
            steamActionName: "vcg_overlay_down",
            actionId: "navigate-down",
            valueType: "digital",
          },
          {
            steamActionName: "vcg_overlay_left",
            actionId: "navigate-left",
            valueType: "digital",
          },
          {
            steamActionName: "vcg_overlay_right",
            actionId: "navigate-right",
            valueType: "digital",
          },
          {
            steamActionName: "vcg_overlay_confirm",
            actionId: "confirm",
            valueType: "digital",
          },
        ],
        analogActions: [],
      },
    ],
    actionSetLayers: [
      {
        layerId: "vcg-text-entry",
        steamLayerName: "VCG_Text_Entry",
        parentActionSetId: "vcg-shell",
        context: "controller-text-entry",
        hostOwned: true,
        gameActionDeliveryAllowed: false,
      },
    ],
    reservedActionBoundary: {
      actionIds: ["home", "back", "pause"],
      authority: "host-or-compositor-only",
      steamActionMayBeSoleAuthority: false,
      remappable: false,
      deliverableToGame: false,
      legacyEmulationAllowed: false,
    },
    textEntryBoundary: {
      requestActionId: "request-text-entry",
      provider: "steamutils-show-gamepad-text-input",
      layerIdWhileOpen: "vcg-text-entry",
      controllerOnlyConfirmAndCancelRequired: true,
      steamAccountRequired: false,
      enteredTextMayEnterDiagnosticsOrEvidence: false,
    },
    glyphBoundary: {
      source: "steam-action-origin-when-available",
      safeGenericFallbackRequired: true,
      brandedGlyphMayBeGuessed: false,
      freeTextDeviceNameAllowed: false,
    },
    unknownControllerBoundary: {
      standardsConformantControllersRemainWithinPromise: true,
      zeroSetupCanonicalDefaultsRequired: true,
      ambiguousMappingAuthority: "none-until-guided-mapping",
      guidedMappingMustBeControllerOnly: true,
      reservedActionsMayBeGuessed: false,
      unsupportedOrAmbiguousMayCountAsCompatibility: false,
    },
    legacyModeBoundary: {
      permittedForDeclaredCompatibilityOnly: true,
      mayQualifyNativeActionIntegration: false,
      mixedMouseKeyboardAndGamepadMustBeTested: true,
      matchingGlyphsMayBeAssumed: false,
      ordinaryEmulationClasses: ["gamepad", "keyboard", "mouse"],
      reservedActionEmulationAllowed: false,
    },
  });
