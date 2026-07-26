import { describe, expect, it } from "vitest";
import {
  AcceptedCalibrationResultCollection,
  CALIBRATION_READY_RESULT_LIMIT,
  CALIBRATION_REHEARSAL_MAX_SAMPLES,
  CALIBRATION_REHEARSAL_MIN_SAMPLES,
  CALIBRATION_REHEARSAL_SESSION_TTL_MS,
  CalibrationRehearsalController,
  type CalibrationAttemptRef,
  type CalibrationObservation,
} from "./calibration-rehearsal";

function readyObservation(
  sampleNumber: number,
  overrides: Partial<CalibrationObservation> = {},
): CalibrationObservation {
  return {
    sampleNumber,
    bodyCount: 1,
    fullBodyVisible: true,
    feetVisible: true,
    cameraStable: true,
    zoneClear: true,
    floorConfidence: 0.93,
    zoneConfidence: 0.94,
    scaleConfidence: 0.92,
    neutralConfidence: 0.91,
    rangeConfidence: 0.9,
    ...overrides,
  };
}

function opened(
  nowMs = 0,
): {
  controller: CalibrationRehearsalController;
  attempt: CalibrationAttemptRef;
} {
  const controller = new CalibrationRehearsalController();
  controller.open(
    "profile-randy",
    "room-fixture-a",
    "camera-fixture-a",
    nowMs,
  );
  return {
    controller,
    attempt: controller.beginAutomatic(nowMs + 1),
  };
}

function submit(
  controller: CalibrationRehearsalController,
  attempt: CalibrationAttemptRef,
  factory: (sampleNumber: number) => CalibrationObservation =
    readyObservation,
  count = CALIBRATION_REHEARSAL_MIN_SAMPLES,
  nowMs = 10,
): void {
  for (let index = 1; index <= count; index += 1) {
    controller.submitObservation(
      attempt,
      factory(index),
      nowMs + index,
    );
  }
}

describe("CalibrationRehearsalController", () => {
  it("starts empty with a frozen identity-minimized projection", () => {
    const snapshot = new CalibrationRehearsalController().snapshot();

    expect(snapshot).toMatchObject({
      revision: 0,
      phase: "idle",
      profileId: null,
      sessionId: null,
      attempt: null,
      sampleCount: 0,
      sessionExpiresAtMs: null,
      issues: [],
      guidedSteps: [],
      readyResult: null,
      invalidationReason: null,
    });
    expect(snapshot.dimensions).toHaveLength(5);
    expect(snapshot.dimensions.every(
      (dimension) =>
        dimension.status === "unknown"
        && dimension.confidence === null,
    )).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.dimensions)).toBe(true);
    expect(Object.isFrozen(snapshot.dimensions[0])).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /landmark|pixel|frame|height|weight|bodyMeasurement|path|image/i,
    );
  });

  it("requires explicit notice, ordered observations, and the minimum sample count", () => {
    const controller = new CalibrationRehearsalController();
    const notice = controller.open(
      "profile-randy",
      "room-fixture-a",
      "camera-fixture-a",
      0,
    );
    expect(notice.phase).toBe("notice");
    expect(() => controller.evaluate(0)).toThrow(
      "requires active observation",
    );

    const attempt = controller.beginAutomatic(1);
    controller.submitObservation(attempt, readyObservation(1), 2);
    expect(() => controller.submitObservation(
      attempt,
      readyObservation(3),
      3,
    )).toThrow("sequence mismatch");
    expect(() => controller.evaluate(3)).toThrow("needs more");
  });

  it("automatically reaches ready when every required dimension passes", () => {
    const { controller, attempt } = opened();
    submit(controller, attempt);

    const snapshot = controller.evaluate(20);
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.guidedSteps).toEqual([]);
    expect(snapshot.dimensions.every(
      (dimension) =>
        dimension.status === "ready"
        && (dimension.confidence ?? 0) >= 0.9,
    )).toBe(true);
    expect(snapshot.readyResult).toEqual({
      id: "calibration-fixture-1-1",
      profileId: "profile-randy",
      sessionId: 1,
      attempt: 1,
      limited: false,
    });
    expect(Object.isFrozen(snapshot.readyResult)).toBe(true);
  });

  it("guides only failed dimensions and invalidates stale callbacks after correction", () => {
    const { controller, attempt } = opened();
    submit(
      controller,
      attempt,
      (sampleNumber) =>
        readyObservation(sampleNumber, {
          feetVisible: false,
          floorConfidence: 0.61,
        }),
    );
    const guided = controller.evaluate(20);

    expect(guided.phase).toBe("guided");
    expect(guided.issues).toEqual([
      "feet-missing",
      "floor-low-confidence",
    ]);
    expect(guided.guidedSteps).toEqual(["camera-placement"]);
    expect(guided.dimensions.find(
      (dimension) => dimension.dimension === "floor",
    )?.status).toBe("needs-check");
    expect(guided.dimensions.find(
      (dimension) => dimension.dimension === "play-zone",
    )?.status).toBe("ready");
    expect(() => controller.skipOptionalGuidance(20)).toThrow(
      "cannot be skipped",
    );

    const correctedAttempt = controller.beginAutomatic(21);
    expect(correctedAttempt.attempt).toBe(2);
    expect(() => controller.submitObservation(
      attempt,
      readyObservation(1),
      22,
    )).toThrow("stale");
    submit(controller, correctedAttempt, readyObservation, 8, 30);
    expect(controller.evaluate(50).phase).toBe("ready");
  });

  it("blocks unsafe placement, camera movement, and ambiguous player count", () => {
    const { controller, attempt } = opened();
    submit(
      controller,
      attempt,
      (sampleNumber) =>
        readyObservation(sampleNumber, {
          bodyCount: sampleNumber === 2 ? 2 : 1,
          cameraStable: sampleNumber !== 3,
          zoneClear: sampleNumber !== 4,
        }),
    );
    const blocked = controller.evaluate(20);

    expect(blocked.phase).toBe("blocked");
    expect(blocked.issues).toEqual([
      "multiple-people",
      "camera-moved",
      "unsafe-zone",
    ]);
    expect(blocked.dimensions.every(
      (dimension) => dimension.status === "blocked",
    )).toBe(true);
    expect(blocked.readyResult).toBeNull();
    expect(() => controller.skipOptionalGuidance(20)).toThrow(
      "requires guided correction",
    );
    expect(controller.beginAutomatic(21).attempt).toBe(2);
  });

  it("allows only neutral/range guidance to use an explicit conservative skip", () => {
    const { controller, attempt } = opened();
    submit(
      controller,
      attempt,
      (sampleNumber) =>
        readyObservation(sampleNumber, {
          neutralConfidence: 0.6,
          rangeConfidence: 0.55,
        }),
    );
    const guided = controller.evaluate(20);
    expect(guided.phase).toBe("guided");
    expect(guided.guidedSteps).toEqual([
      "neutral-stance",
      "usable-range",
    ]);

    const limited = controller.skipOptionalGuidance(21);
    expect(limited.phase).toBe("ready");
    expect(limited.readyResult?.limited).toBe(true);
    expect(limited.dimensions.filter(
      (dimension) => dimension.status === "conservative",
    ).map((dimension) => dimension.dimension)).toEqual([
      "neutral-stance",
      "usable-range",
    ]);
  });

  it("rejects unknown observation fields, invalid confidence, unsafe IDs, and callback forgery", () => {
    const { controller, attempt } = opened();
    expect(() => controller.submitObservation(
      attempt,
      {
        ...readyObservation(1),
        bodyHeightCm: 178,
      } as never,
      2,
    )).toThrow("closed schema");
    expect(() => controller.submitObservation(
      attempt,
      readyObservation(1, { floorConfidence: Number.NaN }),
      2,
    )).toThrow("confidence");
    expect(() => controller.submitObservation(
      { ...attempt, environmentId: "room-fixture-b" },
      readyObservation(1),
      2,
    )).toThrow("stale");
    expect(() => new CalibrationRehearsalController().open(
      "../profile",
      "room-fixture-a",
      "camera-fixture-a",
      0,
    )).toThrow("profile ID");
  });

  it("cancels and expires without producing a calibration result", () => {
    const first = opened(10);
    submit(first.controller, first.attempt, readyObservation, 8, 20);
    expect(first.controller.cancel(40)).toMatchObject({
      phase: "idle",
      readyResult: null,
    });
    expect(() => first.controller.evaluate(40)).toThrow(
      "no calibration rehearsal",
    );

    const expiring = opened(100);
    expect(expiring.controller.expire(
      100 + CALIBRATION_REHEARSAL_SESSION_TTL_MS,
    )).toBeNull();
    expect(expiring.controller.expire(
      100 + CALIBRATION_REHEARSAL_SESSION_TTL_MS + 1,
    )).toMatchObject({
      phase: "idle",
      readyResult: null,
    });
  });

  it("invalidates ready state only for exact changed room/camera evidence", () => {
    const { controller, attempt } = opened();
    submit(controller, attempt);
    controller.evaluate(20);

    expect(() => controller.invalidate(
      "room-change",
      "room-fixture-a",
      "camera-fixture-a",
      21,
    )).toThrow("changed environment");
    expect(() => controller.invalidate(
      "camera-change",
      "room-fixture-a",
      "camera-fixture-a",
      21,
    )).toThrow("changed configuration");
    const invalidated = controller.invalidate(
      "room-change",
      "room-fixture-b",
      "camera-fixture-a",
      21,
    );
    expect(invalidated).toMatchObject({
      phase: "invalidated",
      readyResult: null,
      invalidationReason: "room-change",
    });
    expect(invalidated.dimensions.every(
      (dimension) => dimension.status === "blocked",
    )).toBe(true);
    const restarted = controller.beginAutomatic(22);
    expect(restarted.environmentId).toBe("room-fixture-b");
    expect(restarted.attempt).toBe(2);
  });

  it("bounds samples and safe time while rejecting backwards clocks", () => {
    expect(() => new CalibrationRehearsalController().open(
      "profile-randy",
      "room-fixture-a",
      "camera-fixture-a",
      Number.MAX_SAFE_INTEGER,
    )).toThrow("safe time");

    const { controller, attempt } = opened(100);
    expect(() => controller.submitObservation(
      attempt,
      readyObservation(1),
      99,
    )).toThrow("clock moved backwards");

    const bounded = opened();
    submit(
      bounded.controller,
      bounded.attempt,
      readyObservation,
      CALIBRATION_REHEARSAL_MAX_SAMPLES,
    );
    expect(() => bounded.controller.submitObservation(
      bounded.attempt,
      readyObservation(CALIBRATION_REHEARSAL_MAX_SAMPLES + 1),
      100,
    )).toThrow("too many");
  });

  it("keeps result and review projections free of measurements and storage authority", () => {
    const { controller, attempt } = opened();
    submit(controller, attempt);
    const snapshot = controller.evaluate(20);
    const encoded = JSON.stringify(snapshot);

    expect(encoded).not.toMatch(
      /shoulder|hip|ankle|centimeter|meter|homography|landmark|frame|pixel|blob|path|vault|export|network/i,
    );
    expect(snapshot.readyResult?.id).toMatch(
      /^calibration-fixture-[0-9]+-[0-9]+$/,
    );
  });

  it("issues exact one-shot result authority and revokes invalidated or cancelled results", () => {
    const accepted = new AcceptedCalibrationResultCollection();
    const controller = new CalibrationRehearsalController(accepted);
    controller.open(
      "profile-randy",
      "room-fixture-a",
      "camera-fixture-a",
      0,
    );
    const attempt = controller.beginAutomatic(1);
    submit(controller, attempt);
    const ready = controller.evaluate(20).readyResult!;

    expect(accepted.size).toBe(1);
    expect(accepted.hasExact(ready, 20)).toBe(true);
    expect(accepted.hasExact({
      ...ready,
      profileId: "profile-guest",
    }, 20)).toBe(false);
    expect(accepted.hasExact({
      ...ready,
      limited: true,
    }, 20)).toBe(false);

    controller.invalidate(
      "room-change",
      "room-fixture-b",
      "camera-fixture-a",
      21,
    );
    expect(accepted.hasExact(ready, 21)).toBe(false);

    const restarted = controller.beginAutomatic(22);
    submit(controller, restarted, readyObservation, 8, 30);
    const replacement = controller.evaluate(50).readyResult!;
    expect(accepted.hasExact(replacement, 50)).toBe(true);
    controller.cancel(51);
    expect(accepted.hasExact(replacement, 51)).toBe(false);
  });

  it("bounds issued results, expires old entries, and consumes each exact result once", () => {
    const accepted = new AcceptedCalibrationResultCollection();
    const first = {
      id: "calibration-fixture-1-1",
      profileId: "profile-randy",
      sessionId: 1,
      attempt: 1,
      limited: false,
    } as const;
    accepted.issue(first, 0, 10);
    expect(accepted.consumeExact({
      ...first,
      profileId: "profile-guest",
    }, 1)).toBe(false);
    expect(accepted.consumeExact(first, 1)).toBe(true);
    expect(accepted.consumeExact(first, 1)).toBe(false);

    for (
      let sessionId = 1;
      sessionId <= CALIBRATION_READY_RESULT_LIMIT;
      sessionId += 1
    ) {
      accepted.issue({
        id: `calibration-fixture-${sessionId}-2`,
        profileId: "profile-randy",
        sessionId,
        attempt: 2,
        limited: false,
      }, 2, 100);
    }
    expect(accepted.size).toBe(CALIBRATION_READY_RESULT_LIMIT);
    expect(() => accepted.issue({
      id: "calibration-fixture-65-2",
      profileId: "profile-randy",
      sessionId: 65,
      attempt: 2,
      limited: false,
    }, 2, 100)).toThrow("too many unconsumed");
    expect(() => accepted.issue({
      id: "calibration-fixture-1-2",
      profileId: "profile-randy",
      sessionId: 1,
      attempt: 2,
      limited: false,
    }, 2, 100)).toThrow("already issued");

    const replacement = {
      id: "calibration-fixture-65-2",
      profileId: "profile-randy",
      sessionId: 65,
      attempt: 2,
      limited: false,
    } as const;
    accepted.issue(replacement, 101, 200);
    expect(accepted.size).toBe(1);
    expect(accepted.hasExact(replacement, 200)).toBe(true);
    expect(accepted.hasExact(replacement, 201)).toBe(false);
    expect(accepted.size).toBe(0);
    expect(() => accepted.issue(first, 11, 10)).toThrow(
      "cannot be issued after expiry",
    );
  });

  it("does not expose Ready when result issuance cannot commit", () => {
    const accepted = new AcceptedCalibrationResultCollection();
    for (
      let index = 0;
      index < CALIBRATION_READY_RESULT_LIMIT;
      index += 1
    ) {
      accepted.issue({
        id: `calibration-fixture-${index + 100}-1`,
        profileId: "profile-randy",
        sessionId: index + 100,
        attempt: 1,
        limited: false,
      }, 0, CALIBRATION_REHEARSAL_SESSION_TTL_MS);
    }
    const controller = new CalibrationRehearsalController(accepted);
    controller.open(
      "profile-randy",
      "room-fixture-a",
      "camera-fixture-a",
      0,
    );
    const attempt = controller.beginAutomatic(1);
    submit(controller, attempt);

    expect(() => controller.evaluate(20)).toThrow(
      "too many unconsumed",
    );
    expect(controller.snapshot()).toMatchObject({
      phase: "observing",
      readyResult: null,
    });
    expect(accepted.size).toBe(CALIBRATION_READY_RESULT_LIMIT);
  });
});
