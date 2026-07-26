import { describe, expect, it } from "vitest";
import {
  ConsoleOperatingModeController,
  LOCAL_CONFIRMATION_WINDOW_MS,
} from "./operating-mode";

describe("ConsoleOperatingModeController", () => {
  it("boots and reboots in family mode with developer authority denied", () => {
    const controller = new ConsoleOperatingModeController();
    expect(controller.snapshot()).toEqual({
      identityKind: "local-profile",
      mode: "family",
      canManageConsole: false,
      canPairDeveloperWorkstation: false,
      canUseDeveloperTransport: false,
    });

    controller.requestAdminConfirmation(1_000);
    controller.confirmLocally(1_001);
    controller.requestDeveloperConfirmation(1_002);
    controller.confirmLocally(1_003);
    expect(controller.snapshot().canUseDeveloperTransport).toBe(true);
    expect(controller.reboot()).toMatchObject({
      mode: "family",
      canManageConsole: false,
      canPairDeveloperWorkstation: false,
      canUseDeveloperTransport: false,
    });
  });

  it("requires two distinct live local confirmations before developer mode", () => {
    const controller = new ConsoleOperatingModeController();
    expect(() => controller.requestDeveloperConfirmation(0)).toThrow("admin mode");

    expect(controller.requestAdminConfirmation(10)).toMatchObject({
      mode: "family",
      pendingConfirmation: { action: "enter-admin" },
    });
    expect(controller.confirmLocally(11)).toMatchObject({
      mode: "admin",
      canManageConsole: true,
      canUseDeveloperTransport: false,
    });

    expect(controller.requestDeveloperConfirmation(12)).toMatchObject({
      mode: "admin",
      pendingConfirmation: { action: "enable-developer" },
    });
    expect(controller.confirmLocally(13)).toMatchObject({
      mode: "developer",
      canPairDeveloperWorkstation: true,
      canUseDeveloperTransport: true,
    });
  });

  it("expires confirmation and never grants on a stale acknowledgement", () => {
    const controller = new ConsoleOperatingModeController();
    controller.requestAdminConfirmation(100);
    expect(() =>
      controller.confirmLocally(100 + LOCAL_CONFIRMATION_WINDOW_MS),
    ).toThrow("no live local confirmation");
    expect(controller.snapshot()).toMatchObject({
      mode: "family",
      canManageConsole: false,
    });
  });

  it("cancel, family lock, and developer exit revoke the expected scope", () => {
    const controller = new ConsoleOperatingModeController();
    controller.requestAdminConfirmation(1);
    expect(controller.cancelConfirmation().pendingConfirmation).toBeUndefined();
    expect(() => controller.confirmLocally(2)).toThrow("no live");

    controller.requestAdminConfirmation(3);
    controller.confirmLocally(4);
    controller.requestDeveloperConfirmation(5);
    controller.confirmLocally(6);
    expect(controller.endDeveloperMode()).toMatchObject({
      mode: "admin",
      canUseDeveloperTransport: false,
    });
    expect(controller.lockToFamily()).toMatchObject({
      mode: "family",
      canManageConsole: false,
    });
  });

  it("never treats a guest or local profile as privilege authority", () => {
    const controller = new ConsoleOperatingModeController("guest");
    expect(controller.snapshot()).toMatchObject({
      identityKind: "guest",
      mode: "family",
      canManageConsole: false,
    });

    controller.requestAdminConfirmation(1);
    controller.confirmLocally(2);
    expect(controller.changeIdentity("local-profile")).toMatchObject({
      identityKind: "local-profile",
      mode: "family",
      canManageConsole: false,
      canUseDeveloperTransport: false,
    });

    controller.requestAdminConfirmation(3);
    controller.confirmLocally(4);
    expect(controller.changeIdentity("local-profile")).toMatchObject({
      identityKind: "local-profile",
      mode: "family",
      canManageConsole: false,
    });
  });

  it("rejects invalid clocks and impossible transitions", () => {
    const controller = new ConsoleOperatingModeController();
    expect(() => controller.requestAdminConfirmation(-1)).toThrow("safe integer");
    expect(() => controller.requestAdminConfirmation(Number.MAX_SAFE_INTEGER)).toThrow(
      "safe integer",
    );
    expect(() => controller.confirmLocally(0)).toThrow("no live");
    expect(() => controller.endDeveloperMode()).toThrow("not active");

    controller.requestAdminConfirmation(1);
    expect(() => controller.requestAdminConfirmation(2)).toThrow("idle family");
    controller.confirmLocally(3);
    expect(() => controller.requestAdminConfirmation(4)).toThrow("idle family");
  });
});
