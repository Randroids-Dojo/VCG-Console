import { describe, expect, it } from "vitest";
import {
  PLAYER_SESSION_ADVERSARIAL_FIXTURE_VERSION,
  PLAYER_SESSION_INTERFERENCE_CLASSES,
  runPlayerSessionAdversarialRehearsal,
} from "./player-session-adversarial";

describe("player-session adversarial rehearsal", () => {
  it("covers every named interference class with no authority failure", () => {
    const report = runPlayerSessionAdversarialRehearsal();

    expect(report.schemaVersion).toBe(
      PLAYER_SESSION_ADVERSARIAL_FIXTURE_VERSION,
    );
    expect(report.source).toBe("camera-free synthetic tracks");
    expect(report.coveredInterferenceClasses).toEqual(
      PLAYER_SESSION_INTERFERENCE_CLASSES,
    );
    expect(report.scenarios).toHaveLength(5);
    expect(report.scenarios.every(({ checks }) =>
      checks.length > 0 && checks.every(({ passed }) => passed),
    )).toBe(true);
    expect(report.totals).toMatchObject({
      falseJoins: 0,
      falseControls: 0,
      unintendedTakeovers: 0,
      falseActions: 0,
      explicitTakeovers: 1,
    });
    expect(report.totals.falseCandidateObservations).toBeGreaterThan(0);
    expect(report.passed).toBe(true);
  });

  it("proves passive detection and outsider actions do not join or control", () => {
    const report = runPlayerSessionAdversarialRehearsal();
    const passive = report.scenarios.find(
      ({ id }) => id === "passive-spectator",
    );
    const household = report.scenarios.find(
      ({ id }) => id === "pet-mirror-television",
    );

    expect(passive).toMatchObject({
      finalPhase: "setup",
      metrics: {
        falseCandidateObservations: 1,
        falseJoins: 0,
        falseControls: 0,
        unintendedTakeovers: 0,
        falseActions: 0,
        explicitTakeovers: 0,
      },
    });
    expect(household?.interferenceClasses).toEqual([
      "pet",
      "mirror",
      "television-person",
    ]);
    expect(
      household?.checks.find(({ id }) => id === "joined-action-wins")
        ?.passed,
    ).toBe(true);
  });

  it("distinguishes silent recovery from deliberate takeover", () => {
    const report = runPlayerSessionAdversarialRehearsal();
    const passerby = report.scenarios.find(
      ({ id }) => id === "passerby-during-loss",
    );
    const takeover = report.scenarios.find(
      ({ id }) => id === "deliberate-one-player-takeover",
    );

    expect(passerby).toMatchObject({
      finalPhase: "playing",
      metrics: {
        unintendedTakeovers: 0,
        explicitTakeovers: 0,
      },
    });
    expect(
      passerby?.checks.find(
        ({ id }) => id === "passerby-no-silent-recovery",
      )?.passed,
    ).toBe(true);
    expect(takeover).toMatchObject({
      finalPhase: "playing",
      metrics: {
        unintendedTakeovers: 0,
        explicitTakeovers: 1,
      },
    });
  });

  it("refuses outsider substitution in multiplayer recovery", () => {
    const report = runPlayerSessionAdversarialRehearsal();
    const multiplayer = report.scenarios.find(
      ({ id }) => id === "multiplayer-outsider-recovery",
    );

    expect(multiplayer?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "missing-player-not-substituted",
          passed: true,
        }),
        expect.objectContaining({
          id: "explicit-roster-reduction",
          passed: true,
        }),
      ]),
    );
    expect(multiplayer?.metrics).toMatchObject({
      falseJoins: 0,
      falseControls: 0,
      unintendedTakeovers: 0,
      falseActions: 0,
    });
  });

  it("returns a deterministic minimized report without body or image data", () => {
    const first = runPlayerSessionAdversarialRehearsal();
    const second = runPlayerSessionAdversarialRehearsal();
    const serialized = JSON.stringify(first);

    expect(second).toEqual(first);
    for (const forbidden of [
      "image",
      "portrait",
      "landmark",
      "embedding",
      "bodyMeasurement",
      "displayName",
      "filePath",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized.length).toBeLessThan(12_000);
  });
});
