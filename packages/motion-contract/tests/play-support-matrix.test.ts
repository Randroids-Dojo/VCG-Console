import { describe, expect, it } from "vitest";
import {
  PLAY_SUPPORT_ALTERNATE_ROUTES,
  PLAY_SUPPORT_SCENARIOS,
  PlaySupportMatrixSchema,
  assessPlaySupportScenario,
  buildPlaySupportMatrix,
  playSupportMatrixJsonSchema,
} from "../src";

const provenance = {
  implementationPath: "packages/motion-contract/src/play-support-matrix.ts" as const,
  implementationSha256: "a".repeat(64),
  generatorPath: "scripts/generate-play-support-matrix.mjs" as const,
  generatorSha256: "b".repeat(64),
  validatorPath: "scripts/validate-play-support-matrix.mjs" as const,
  validatorSha256: "c".repeat(64),
};

function scenario(id: (typeof PLAY_SUPPORT_SCENARIOS)[number]["scenarioId"]) {
  return PLAY_SUPPORT_SCENARIOS.find(({ scenarioId }) => scenarioId === id)!;
}

describe("seated, partial-body, and assisted play matrix", () => {
  it("keeps a full independent standing synthetic path available", () => {
    const result = assessPlaySupportScenario(
      scenario("standing-full-independent-controller"),
    );
    expect(result.controls.map(({ supportLabel }) => supportLabel)).toEqual(
      Array(6).fill("synthetic-motion-path"),
    );
    expect(result.controls.every(({ alternateMapping }) => alternateMapping === null)).toBe(
      true,
    );
  });

  it("does not turn observed seated gameplay geometry into authorization", () => {
    const result = assessPlaySupportScenario(
      scenario("seated-full-independent-controller"),
    );
    expect(result.availableMotionControlCountBeforeSafetyGate).toBe(6);
    expect(result.controls.slice(0, 3).map(({ supportLabel }) => supportLabel)).toEqual(
      Array(3).fill("synthetic-motion-path"),
    );
    expect(result.controls.slice(3)).toMatchObject([
      {
        observedPath: "available",
        safetyGate: "blocked-seated-gameplay-unqualified",
        supportLabel: "controller-alternate-only",
      },
      {
        observedPath: "available",
        safetyGate: "blocked-seated-gameplay-unqualified",
        supportLabel: "controller-alternate-only",
      },
      {
        observedPath: "available",
        safetyGate: "blocked-seated-gameplay-unqualified",
        supportLabel: "controller-alternate-only",
      },
    ]);
  });

  it("retains upper-body menus but never extrapolates an absent seated lower body", () => {
    const result = assessPlaySupportScenario(scenario("seated-upper-body-controller"));
    expect(result.availabilityState).toBe("partial");
    expect(result.controls.map(({ observedPath }) => observedPath)).toEqual([
      "available",
      "available",
      "available",
      "unavailable",
      "available",
      "unavailable",
    ]);
    expect(result.controls.slice(3).map(({ supportLabel }) => supportLabel)).toEqual(
      Array(3).fill("controller-alternate-only"),
    );
  });

  it("preserves unrelated controls when only knees and ankles are missing", () => {
    const result = assessPlaySupportScenario(
      scenario("partial-legs-missing-controller"),
    );
    expect(result.controls.map(({ supportLabel }) => supportLabel)).toEqual([
      "synthetic-motion-path",
      "synthetic-motion-path",
      "synthetic-motion-path",
      "synthetic-motion-path",
      "synthetic-motion-path",
      "controller-alternate-only",
    ]);
    expect(result.controls[5]!.alternateMapping?.route).toBe(
      "title-declared-controller-jump",
    );
  });

  it("reports unsupported controls when neither body path nor controller exists", () => {
    const result = assessPlaySupportScenario(
      scenario("partial-left-side-no-controller"),
    );
    expect(result.controls.every(({ supportLabel }) => supportLabel === "unsupported")).toBe(
      true,
    );
    expect(result.controls.every(({ alternateMapping }) => alternateMapping === null)).toBe(
      true,
    );
  });

  it("blocks helper-overlap body input even when all authored landmarks are observed", () => {
    const result = assessPlaySupportScenario(
      scenario("assisted-overlap-controller"),
    );
    expect(result.availableMotionControlCountBeforeSafetyGate).toBe(6);
    expect(result.controls.every(
      ({ safetyGate }) => safetyGate === "blocked-assisted-identity-unqualified",
    )).toBe(true);
    expect(result.controls.every(
      ({ supportLabel }) => supportLabel === "controller-alternate-only",
    )).toBe(true);
  });

  it("keeps reserved controller routes explicit and outside remapping", () => {
    expect(PLAY_SUPPORT_ALTERNATE_ROUTES.menuBackPause).toBe(
      "reserved-controller-back-pause",
    );
    const result = assessPlaySupportScenario(
      scenario("assisted-overlap-controller"),
    );
    expect(result.controls[1]!.alternateMapping).toEqual({
      mappingId: "canonical-controller-v1",
      route: "reserved-controller-back-pause",
      authority: "existing-controller-path-only",
    });
  });

  it("builds the exact bounded matrix and an honest schema", () => {
    const result = buildPlaySupportMatrix(provenance);
    expect(PlaySupportMatrixSchema.parse(result)).toEqual(result);
    expect(result.summary).toEqual({
      scenarioCount: 7,
      controlAssessmentCount: 42,
      syntheticMotionPathCount: 17,
      controllerAlternateOnlyCount: 13,
      unsupportedCount: 12,
      safetyBlockedCount: 18,
    });
    expect(result.policy).toMatchObject({
      seatedGameplayMotionAuthorized: false,
      assistedBodyMotionAuthorized: false,
      silentScoreNormalizationAuthorized: false,
      newBodyAlternateMappingsAuthorized: false,
      standardControllerFallbackRetained: true,
      reservedHomeBackPauseRemappable: false,
    });
    expect(playSupportMatrixJsonSchema).toMatchObject({
      $id: "urn:vcg:schema:play-support-matrix:1",
      title: "VCG seated, partial-body, and assisted play matrix v1",
    });
    expect(playSupportMatrixJsonSchema.$comment).toContain(
      "grants no product qualification",
    );
  });

  it("rejects unbounded or undeclared scenario fields", () => {
    expect(() =>
      assessPlaySupportScenario({
        ...scenario("standing-full-independent-controller"),
        // @ts-expect-error adversarial unknown field
        normalizeScore: true,
      }),
    ).toThrow();
  });
});
