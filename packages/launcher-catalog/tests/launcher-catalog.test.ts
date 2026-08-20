import { describe, expect, it } from "vitest";
import circuitShift from "../../../catalog/circuit-shift.vcg-game.json";
import determined from "../../../catalog/determined.vcg-game.json";
import policy from "../../../catalog/launcher-policy.json";
import miCasa from "../../../catalog/mi-casa-es-su-casa.vcg-game.json";
import nesMetalGear from "../../../catalog/nes-metal-gear.vcg-game.json";
import nesSuperMarioBrosDuckHunt from "../../../catalog/nes-super-mario-bros-duck-hunt.vcg-game.json";
import retro2048 from "../../../catalog/retro-2048.vcg-game.json";
import snesDonkeyKongCountry2 from "../../../catalog/snes-donkey-kong-country-2.vcg-game.json";
import snesYoshisIsland from "../../../catalog/snes-yoshis-island.vcg-game.json";
import vibeBots from "../../../catalog/vibebots.vcg-game.json";
import {
  LauncherCatalogError,
  buildLauncherCatalog,
  serializeLauncherCatalogModule,
} from "../src/index";

const manifests: readonly unknown[] = [
  circuitShift,
  determined,
  miCasa,
  nesMetalGear,
  nesSuperMarioBrosDuckHunt,
  retro2048,
  snesDonkeyKongCountry2,
  snesYoshisIsland,
  vibeBots,
];

describe("canonical launcher catalog", () => {
  it("resolves every policy entry from validated game-manifest authority", () => {
    const catalog = buildLauncherCatalog(manifests, policy);

    expect(catalog.entries.map((entry) => entry.id)).toEqual([
      "vibebots",
      "mi-casa-es-su-casa",
      "determined",
      "circuit-shift",
      "nes-super-mario-bros-duck-hunt",
      "nes-metal-gear",
      "snes-yoshis-island",
      "snes-donkey-kong-country-2",
      "retro-2048",
    ]);
    expect(catalog.entries[0]).toMatchObject({
      title: "VibeBots",
      version: "hosted-5b5d17ef-2026-07-19",
      runtime: "remote-web",
      entrypoint: "https://vibebots.randroid.dev/mine",
      surface: "museum",
    });
    expect(catalog.entries[3]).toMatchObject({
      title: "Circuit Shift",
      runtime: "local-web",
      network: "offline",
      surface: "retro",
    });
    expect(catalog.entries[4]).toMatchObject({
      title: "Super Mario Bros. + Duck Hunt",
      runtime: "libretro",
      network: "offline",
      compatibilityStatus: "unverified",
      surface: "retro",
    });
    expect(catalog.entries[8]).toMatchObject({
      title: "2048",
      runtime: "libretro",
      network: "offline",
      surface: "retro",
    });
  });

  it("serializes one deterministic typed browser artifact", () => {
    const catalog = buildLauncherCatalog(manifests, policy);
    const first = serializeLauncherCatalogModule(catalog);
    const second = serializeLauncherCatalogModule(
      buildLauncherCatalog([...manifests].reverse(), structuredClone(policy)),
    );

    expect(second).toBe(first);
    expect(first).toContain("satisfies LauncherCatalog");
    expect(first).toContain('"id": "retro-2048"');
  });

  it("rejects missing, unknown, duplicate, and conflicting catalog membership", () => {
    expect(() => buildLauncherCatalog(manifests.filter((manifest) => manifest !== determined), policy)).toThrow(
      /unknown policy entries: determined/,
    );

    const missingPolicy = structuredClone(policy);
    missingPolicy.entries.pop();
    expect(() => buildLauncherCatalog(manifests, missingPolicy)).toThrow(
      /missing policy entries: retro-2048/,
    );

    const duplicatePolicy = structuredClone(policy);
    duplicatePolicy.entries.push(structuredClone(duplicatePolicy.entries[0]!));
    expect(() => buildLauncherCatalog(manifests, duplicatePolicy)).toThrow(
      /duplicate launcher policy game ID vibebots/,
    );

    expect(() => buildLauncherCatalog([...manifests, structuredClone(vibeBots)], policy)).toThrow(
      /duplicate game manifest ID vibebots/,
    );
  });

  it("rejects unsafe policy URLs, incoherent budgets, and runtime/surface confusion", () => {
    const unsafeUrl = structuredClone(policy);
    unsafeUrl.museum.entrypoint = "https://user:secret@vibecoded.games/";
    expect(() => buildLauncherCatalog(manifests, unsafeUrl)).toThrow(LauncherCatalogError);

    const incoherentBudget = structuredClone(policy);
    incoherentBudget.launchBudgets.local.heartbeatTimeoutMs =
      incoherentBudget.launchBudgets.local.timeoutMs;
    expect(() => buildLauncherCatalog(manifests, incoherentBudget)).toThrow(
      /slowAfterMs < heartbeatTimeoutMs < timeoutMs/,
    );

    const confusedSurface = structuredClone(policy);
    confusedSurface.entries[0]!.surface = "retro";
    expect(() => buildLauncherCatalog(manifests, confusedSurface)).toThrow(
      /retro game vibebots must use the libretro or local-web runtime/,
    );
  });

  it("requires explicit membership while omitting hidden entries from the browser artifact", () => {
    const hiddenCandidate = structuredClone(policy);
    hiddenCandidate.entries[0]!.surface = "hidden";

    const catalog = buildLauncherCatalog(manifests, hiddenCandidate);
    expect(catalog.entries.some((entry) => entry.id === "vibebots")).toBe(false);
    expect(serializeLauncherCatalogModule(catalog)).not.toContain(
      '"id": "vibebots"',
    );
  });

  it("rejects unknown policy fields and duplicate display positions", () => {
    const unknownField = {
      ...structuredClone(policy),
      browserAuthority: true,
    };
    expect(() => buildLauncherCatalog(manifests, unknownField)).toThrow(
      /unrecognized_keys/,
    );

    const duplicateIndex = structuredClone(policy);
    duplicateIndex.entries[1]!.displayIndex = duplicateIndex.entries[0]!.displayIndex;
    expect(() => buildLauncherCatalog(manifests, duplicateIndex)).toThrow(
      /duplicate launcher policy display index M1/,
    );
  });
});
