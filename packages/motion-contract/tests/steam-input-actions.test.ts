import { describe, expect, it } from "vitest";
import {
  STEAM_INPUT_ACTION_SET_IDS,
  STEAM_INPUT_LAYER_IDS,
  STEAM_INPUT_RESERVED_ACTION_IDS,
  VCG_STEAM_INPUT_ACTION_CONTRACT,
  isParsedSteamInputActionContract,
  parseSteamInputActionContract,
} from "../src";

// Adversarial cases intentionally mutate invalid values before reparsing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clone = (): any => structuredClone(VCG_STEAM_INPUT_ACTION_CONTRACT);

describe("Steam Input action contract", () => {
  it("publishes one deeply frozen optional adapter contract", () => {
    expect(VCG_STEAM_INPUT_ACTION_CONTRACT).toMatchObject({
      schemaVersion: 1,
      contractId: "vcg-steam-input-actions-v1",
      disposition: "optional-steam-input-adapter",
      baseInputAuthority: "sdl-or-normal-linux-input",
      steamAccountRequiredForCoreOperation: false,
    });
    expect(Object.isFrozen(VCG_STEAM_INPUT_ACTION_CONTRACT)).toBe(true);
    expect(Object.isFrozen(VCG_STEAM_INPUT_ACTION_CONTRACT.actionSets[0])).toBe(
      true,
    );
    expect(isParsedSteamInputActionContract(VCG_STEAM_INPUT_ACTION_CONTRACT)).toBe(
      true,
    );
    expect(isParsedSteamInputActionContract(clone())).toBe(false);
  });

  it("pins shell, game, overlay, and text-entry contexts", () => {
    expect(
      VCG_STEAM_INPUT_ACTION_CONTRACT.actionSets.map(({ actionSetId }) =>
        actionSetId,
      ),
    ).toEqual(STEAM_INPUT_ACTION_SET_IDS);
    expect(
      VCG_STEAM_INPUT_ACTION_CONTRACT.actionSetLayers.map(({ layerId }) =>
        layerId,
      ),
    ).toEqual(STEAM_INPUT_LAYER_IDS);
    expect(
      VCG_STEAM_INPUT_ACTION_CONTRACT.actionSetLayers[0],
    ).toMatchObject({
      parentActionSetId: "vcg-shell",
      hostOwned: true,
      gameActionDeliveryAllowed: false,
    });
  });

  it("keeps Home, Back, and Pause host-only and non-remappable", () => {
    expect(
      VCG_STEAM_INPUT_ACTION_CONTRACT.reservedActionBoundary,
    ).toEqual({
      actionIds: STEAM_INPUT_RESERVED_ACTION_IDS,
      authority: "host-or-compositor-only",
      steamActionMayBeSoleAuthority: false,
      remappable: false,
      deliverableToGame: false,
      legacyEmulationAllowed: false,
    });
    const serializedSets = JSON.stringify(
      VCG_STEAM_INPUT_ACTION_CONTRACT.actionSets,
    );
    for (const action of STEAM_INPUT_RESERVED_ACTION_IDS) {
      expect(serializedSets).not.toContain(`\"${action}\"`);
    }
  });

  it("uses a separate accountless controller text-entry boundary", () => {
    expect(VCG_STEAM_INPUT_ACTION_CONTRACT.textEntryBoundary).toEqual({
      requestActionId: "request-text-entry",
      provider: "steamutils-show-gamepad-text-input",
      layerIdWhileOpen: "vcg-text-entry",
      controllerOnlyConfirmAndCancelRequired: true,
      steamAccountRequired: false,
      enteredTextMayEnterDiagnosticsOrEvidence: false,
    });
  });

  it("requires action-origin glyphs or a safe unbranded fallback", () => {
    expect(VCG_STEAM_INPUT_ACTION_CONTRACT.glyphBoundary).toEqual({
      source: "steam-action-origin-when-available",
      safeGenericFallbackRequired: true,
      brandedGlyphMayBeGuessed: false,
      freeTextDeviceNameAllowed: false,
    });
  });

  it("keeps standards-conformant and ambiguous controllers fail-closed", () => {
    expect(VCG_STEAM_INPUT_ACTION_CONTRACT.unknownControllerBoundary).toEqual({
      standardsConformantControllersRemainWithinPromise: true,
      zeroSetupCanonicalDefaultsRequired: true,
      ambiguousMappingAuthority: "none-until-guided-mapping",
      guidedMappingMustBeControllerOnly: true,
      reservedActionsMayBeGuessed: false,
      unsupportedOrAmbiguousMayCountAsCompatibility: false,
    });
  });

  it("does not promote legacy emulation into native action integration", () => {
    expect(VCG_STEAM_INPUT_ACTION_CONTRACT.legacyModeBoundary).toEqual({
      permittedForDeclaredCompatibilityOnly: true,
      mayQualifyNativeActionIntegration: false,
      mixedMouseKeyboardAndGamepadMustBeTested: true,
      matchingGlyphsMayBeAssumed: false,
      ordinaryEmulationClasses: ["gamepad", "keyboard", "mouse"],
      reservedActionEmulationAllowed: false,
    });
  });

  it("rejects action set, action, layer, and analog-mode drift", () => {
    for (const mutate of [
      (value: ReturnType<typeof clone>) => value.actionSets.reverse(),
      (value: ReturnType<typeof clone>) => value.actionSets[0].digitalActions.pop(),
      (value: ReturnType<typeof clone>) => {
        value.actionSets[1].analogActions[1].inputMode = "joystick-move";
      },
      (value: ReturnType<typeof clone>) => value.actionSetLayers.pop(),
      (value: ReturnType<typeof clone>) => {
        value.actionSetLayers[0].parentActionSetId = "vcg-game";
      },
    ]) {
      const value = clone();
      mutate(value);
      expect(() => parseSteamInputActionContract(value)).toThrow();
    }
  });

  it("rejects reserved-action, accountless, glyph, unknown-device, or legacy weakening", () => {
    for (const mutate of [
      (value: ReturnType<typeof clone>) => {
        value.reservedActionBoundary.remappable = true;
      },
      (value: ReturnType<typeof clone>) => {
        value.reservedActionBoundary.steamActionMayBeSoleAuthority = true;
      },
      (value: ReturnType<typeof clone>) => {
        value.steamAccountRequiredForCoreOperation = true;
      },
      (value: ReturnType<typeof clone>) => {
        value.textEntryBoundary.steamAccountRequired = true;
      },
      (value: ReturnType<typeof clone>) => {
        value.glyphBoundary.brandedGlyphMayBeGuessed = true;
      },
      (value: ReturnType<typeof clone>) => {
        value.unknownControllerBoundary.reservedActionsMayBeGuessed = true;
      },
      (value: ReturnType<typeof clone>) => {
        value.legacyModeBoundary.mayQualifyNativeActionIntegration = true;
      },
    ]) {
      const value = clone();
      mutate(value);
      expect(() => parseSteamInputActionContract(value)).toThrow();
    }
  });

  it("rejects unknown fields, unsafe IDs, and clone authority", () => {
    expect(() =>
      parseSteamInputActionContract({
        ...clone(),
        steamUserName: "household-user",
      }),
    ).toThrow();
    expect(() =>
      parseSteamInputActionContract({
        ...clone(),
        contractId: "../../steam/config",
      }),
    ).toThrow();
    expect(isParsedSteamInputActionContract(clone())).toBe(false);
  });
});
