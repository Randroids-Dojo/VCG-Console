import { describe, expect, it } from "vitest";
import {
  PORTRAIT_COUNTDOWN_MS,
  PORTRAIT_MAX_PROFILES,
  PORTRAIT_SESSION_TTL_MS,
  PortraitCaptureController,
  PortraitCaptureError,
} from "./portrait-capture";

describe("PortraitCaptureController", () => {
  it("starts camera-free with an immutable identity-minimized snapshot", () => {
    const controller = new PortraitCaptureController();
    const snapshot = controller.snapshot();

    expect(snapshot).toEqual({
      revision: 0,
      phase: "idle",
      profileId: null,
      attempt: null,
      countdownEndsAtMs: null,
      sessionExpiresAtMs: null,
      temporaryRenderHandle: null,
      acceptedPortraits: [],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.acceptedPortraits)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /pixel|imageData|face|embedding|export|backup|cloud|path/i,
    );
  });

  it("requires notice, a complete countdown, and the exact active attempt", () => {
    const controller = new PortraitCaptureController();
    controller.open("profile-randy", 100);
    const attempt = controller.beginCountdown(200);

    expect(attempt).toEqual({
      sessionId: 1,
      attempt: 1,
      profileId: "profile-randy",
    });
    expect(() =>
      controller.completeSyntheticCapture(
        attempt,
        "portrait-fixture-randy-a",
        200 + PORTRAIT_COUNTDOWN_MS - 1,
      ),
    ).toThrow("not complete");
    expect(() =>
      controller.completeSyntheticCapture(
        { ...attempt, attempt: 2 },
        "portrait-fixture-randy-a",
        200 + PORTRAIT_COUNTDOWN_MS,
      ),
    ).toThrow("was not issued by this controller");
    expect(() =>
      controller.completeSyntheticCapture(
        { ...attempt },
        "portrait-fixture-randy-a",
        200 + PORTRAIT_COUNTDOWN_MS,
      ),
    ).toThrow("was not issued by this controller");
    const otherController = new PortraitCaptureController();
    otherController.open("profile-randy", 100);
    otherController.beginCountdown(200);
    expect(() =>
      otherController.completeSyntheticCapture(
        attempt,
        "portrait-fixture-randy-a",
        200 + PORTRAIT_COUNTDOWN_MS,
      ),
    ).toThrow("was not issued by this controller");
    expect(
      controller.completeSyntheticCapture(
        attempt,
        "portrait-fixture-randy-a",
        200 + PORTRAIT_COUNTDOWN_MS,
      ),
    ).toMatchObject({
      phase: "preview",
      temporaryRenderHandle: "portrait-fixture-randy-a",
    });
  });

  it("accepts exactly the preview and keeps one still per profile", () => {
    const controller = new PortraitCaptureController([
      {
        profileId: "profile-randy",
        renderHandle: "portrait-fixture-randy-old",
      },
    ]);
    controller.open("profile-randy", 0);
    const attempt = controller.beginCountdown(1);
    controller.completeSyntheticCapture(
      attempt,
      "portrait-fixture-randy-new",
      1 + PORTRAIT_COUNTDOWN_MS,
    );
    const plan = controller.planAccept(1 + PORTRAIT_COUNTDOWN_MS);
    expect(plan.replacedRenderHandle).toBe("portrait-fixture-randy-old");

    const result = controller.commit(plan, 1 + PORTRAIT_COUNTDOWN_MS);
    expect(result.accepted).toEqual({
      profileId: "profile-randy",
      renderHandle: "portrait-fixture-randy-new",
    });
    expect(result.discardedReplacedRenderHandle).toBe(
      "portrait-fixture-randy-old",
    );
    expect(result.snapshot.acceptedPortraits).toEqual([
      {
        profileId: "profile-randy",
        renderHandle: "portrait-fixture-randy-new",
      },
    ]);
    expect(result.snapshot.phase).toBe("idle");
  });

  it("retake discards the temporary handle and rejects its late callback", () => {
    const controller = new PortraitCaptureController();
    controller.open("profile-randy", 0);
    const first = controller.beginCountdown(1);
    controller.completeSyntheticCapture(
      first,
      "portrait-fixture-randy-a",
      1 + PORTRAIT_COUNTDOWN_MS,
    );
    const retake = controller.retake(1 + PORTRAIT_COUNTDOWN_MS);

    expect(retake.discardedTemporaryRenderHandle).toBe(
      "portrait-fixture-randy-a",
    );
    expect(retake.attempt.attempt).toBe(2);
    expect(() =>
      controller.completeSyntheticCapture(
        first,
        "portrait-fixture-randy-late",
        1 + PORTRAIT_COUNTDOWN_MS * 2,
      ),
    ).toThrow("stale");
    expect(
      controller.completeSyntheticCapture(
        retake.attempt,
        "portrait-fixture-randy-b",
        1 + PORTRAIT_COUNTDOWN_MS * 2,
      ),
    ).toMatchObject({
      phase: "preview",
      temporaryRenderHandle: "portrait-fixture-randy-b",
    });
  });

  it("Back-style cancellation never promotes a preview and preserves the old portrait", () => {
    const controller = new PortraitCaptureController([
      {
        profileId: "profile-randy",
        renderHandle: "portrait-fixture-randy-old",
      },
    ]);
    controller.open("profile-randy", 0);
    const attempt = controller.beginCountdown(1);
    controller.completeSyntheticCapture(
      attempt,
      "portrait-fixture-randy-temporary",
      1 + PORTRAIT_COUNTDOWN_MS,
    );

    const result = controller.cancel(1 + PORTRAIT_COUNTDOWN_MS);
    expect(result.discardedTemporaryRenderHandle).toBe(
      "portrait-fixture-randy-temporary",
    );
    expect(result.preservedAcceptedRenderHandle).toBe(
      "portrait-fixture-randy-old",
    );
    expect(controller.portraitFor("profile-randy")).toBe(
      "portrait-fixture-randy-old",
    );
    expect(() => controller.planAccept(1 + PORTRAIT_COUNTDOWN_MS)).toThrow(
      "no portrait session",
    );
  });

  it("expires abandoned sessions without accepting their temporary preview", () => {
    const controller = new PortraitCaptureController();
    controller.open("profile-randy", 10);
    const attempt = controller.beginCountdown(20);
    controller.completeSyntheticCapture(
      attempt,
      "portrait-fixture-randy-a",
      20 + PORTRAIT_COUNTDOWN_MS,
    );

    expect(controller.expire(10 + PORTRAIT_SESSION_TTL_MS)).toBeNull();
    const expired = controller.expire(
      10 + PORTRAIT_SESSION_TTL_MS + 1,
    );
    expect(expired?.discardedTemporaryRenderHandle).toBe(
      "portrait-fixture-randy-a",
    );
    expect(controller.portraitFor("profile-randy")).toBeNull();
    expect(controller.snapshot().phase).toBe("idle");
  });

  it("rejects cloned commit plans, stale state, and non-fixture handles", () => {
    const controller = new PortraitCaptureController();
    controller.open("profile-randy", 0);
    const attempt = controller.beginCountdown(1);
    expect(() =>
      controller.completeSyntheticCapture(
        attempt,
        "data:image/png;base64,secret",
        1 + PORTRAIT_COUNTDOWN_MS,
      ),
    ).toThrow("render handle");
    controller.completeSyntheticCapture(
      attempt,
      "portrait-fixture-randy-a",
      1 + PORTRAIT_COUNTDOWN_MS,
    );
    const plan = controller.planAccept(1 + PORTRAIT_COUNTDOWN_MS);

    expect(() =>
      controller.commit({
        ...plan,
        exportPath: "D:\\portrait.png",
      } as never, 1 + PORTRAIT_COUNTDOWN_MS),
    ).toThrow("closed schema");
    expect(() =>
      controller.commit({
        ...plan,
        temporaryRenderHandle: "portrait-fixture-randy-b",
      }, 1 + PORTRAIT_COUNTDOWN_MS),
    ).toThrow("was not issued by this controller");
    expect(() =>
      controller.commit(
        { ...plan },
        1 + PORTRAIT_COUNTDOWN_MS,
      ),
    ).toThrow("was not issued by this controller");
    const otherController = new PortraitCaptureController();
    otherController.open("profile-randy", 0);
    const otherAttempt = otherController.beginCountdown(1);
    otherController.completeSyntheticCapture(
      otherAttempt,
      "portrait-fixture-randy-a",
      1 + PORTRAIT_COUNTDOWN_MS,
    );
    expect(() =>
      otherController.commit(
        plan,
        1 + PORTRAIT_COUNTDOWN_MS,
      ),
    ).toThrow("was not issued by this controller");
    controller.retake(1 + PORTRAIT_COUNTDOWN_MS);
    expect(() =>
      controller.commit(plan, 1 + PORTRAIT_COUNTDOWN_MS),
    ).toThrow("stale");
  });

  it("rejects unsafe identities, excessive state, and backwards time", () => {
    expect(() => new PortraitCaptureController(
      Array.from({ length: PORTRAIT_MAX_PROFILES + 1 }, (_, index) => ({
        profileId: `profile-${index}`,
        renderHandle: `portrait-fixture-${index}`,
      })),
    )).toThrow("too many");
    expect(() =>
      new PortraitCaptureController().open("../profile", 0),
    ).toThrow("profile ID");
    const controller = new PortraitCaptureController();
    controller.open("profile-randy", 100);
    expect(() => controller.beginCountdown(99)).toThrow("backwards");
    expect(() => controller.cancel(Number.POSITIVE_INFINITY)).toThrow(
      "safe integer",
    );
  });

  it("never accepts from notice, countdown, cancellation, or profile-name similarity", () => {
    const controller = new PortraitCaptureController();
    controller.open("profile-randy", 0);
    expect(() => controller.planAccept(0)).toThrow("temporary preview");
    controller.beginCountdown(1);
    expect(() => controller.planAccept(1)).toThrow("temporary preview");
    controller.cancel(2);
    expect(controller.portraitFor("profile-randy")).toBeNull();
    expect(() => controller.portraitFor("Randy" as never)).toThrow(
      "profile ID",
    );
  });
});
