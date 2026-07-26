import { describe, expect, it, vi } from "vitest";
import {
  HostedBrowserPreviewController,
  type HostedBrowserWindowOpener,
} from "./hosted-browser-preview";

const DESTINATIONS = Object.freeze([
  Object.freeze({
    id: "vibecoded-museum",
    entrypoint: "https://vibecoded.games",
  }),
  Object.freeze({
    id: "determined",
    entrypoint: "https://determined-khaki.vercel.app",
  }),
]);

describe("HostedBrowserPreviewController", () => {
  it("opens one exact allowlisted origin without retaining opener authority", () => {
    const controller = new HostedBrowserPreviewController(DESTINATIONS);
    const plan = controller.prepare("vibecoded-museum");
    const opened = { opener: {} };
    const opener = vi.fn<HostedBrowserWindowOpener>(() => opened);

    expect(controller.open(plan, opener)).toEqual({
      opened: true,
      code: "PREVIEW_OPENED",
    });
    expect(opener).toHaveBeenCalledWith(
      "https://vibecoded.games",
      "_blank",
      "noopener,noreferrer",
    );
    expect(opened.opener).toBeNull();
    expect(Object.isFrozen(plan)).toBe(true);
    expect(() => controller.open(plan, opener)).toThrow("not issued");
  });

  it("rejects clones, cross-controller plans, and replaced plans before opening", () => {
    const first = new HostedBrowserPreviewController(DESTINATIONS);
    const second = new HostedBrowserPreviewController(DESTINATIONS);
    const initial = first.prepare("vibecoded-museum");
    const clone = structuredClone(initial);
    const opener = vi.fn<HostedBrowserWindowOpener>(() => ({ opener: null }));

    expect(() => first.open(clone, opener)).toThrow("not issued");
    expect(() => second.open(initial, opener)).toThrow("not issued");

    const replacement = first.prepare("determined");
    expect(() => first.open(initial, opener)).toThrow("not issued");
    expect(opener).not.toHaveBeenCalled();
    expect(first.open(replacement, opener)).toMatchObject({
      opened: true,
    });
  });

  it("consumes authority before a blocked, throwing, or reentrant opener", () => {
    const controller = new HostedBrowserPreviewController(DESTINATIONS);
    const blocked = controller.prepare("vibecoded-museum");
    expect(controller.open(blocked, () => null)).toEqual({
      opened: false,
      code: "PREVIEW_BLOCKED",
    });
    expect(() => controller.open(blocked, () => null)).toThrow("not issued");

    const throwing = controller.prepare("vibecoded-museum");
    expect(
      controller.open(throwing, () => {
        throw new Error("synthetic popup failure");
      }),
    ).toEqual({
      opened: false,
      code: "PREVIEW_BLOCKED",
    });

    const reentrant = controller.prepare("vibecoded-museum");
    expect(
      controller.open(reentrant, () => {
        expect(() => controller.open(reentrant, () => null)).toThrow(
          "not issued",
        );
        return { opener: null };
      }),
    ).toMatchObject({ opened: true });
  });

  it("relies on the requested noopener feature when WindowProxy rejects its redundant setter", () => {
    const controller = new HostedBrowserPreviewController(DESTINATIONS);
    const plan = controller.prepare("vibecoded-museum");
    const proxy = Object.defineProperty({}, "opener", {
      set: () => {
        throw new DOMException("synthetic cross-origin proxy", "SecurityError");
      },
    });
    expect(
      controller.open(plan, () => proxy as { opener: unknown }),
    ).toEqual({
      opened: true,
      code: "PREVIEW_OPENED",
    });
  });

  it("discards only the exact current plan", () => {
    const controller = new HostedBrowserPreviewController(DESTINATIONS);
    const plan = controller.prepare("vibecoded-museum");
    expect(() => controller.discard(structuredClone(plan))).toThrow(
      "not issued",
    );
    controller.discard(plan);
    expect(() => controller.open(plan, () => null)).toThrow("not issued");
  });

  for (const [index, input] of [
    [],
    [{ id: "vibecoded-museum", entrypoint: "http://vibecoded.games" }],
    [{ id: "vibecoded-museum", entrypoint: "https://vibecoded.games/path" }],
    [{ id: "vibecoded-museum", entrypoint: "https://user@vibecoded.games" }],
    [{ id: "../museum", entrypoint: "https://vibecoded.games" }],
    [{
      id: "vibecoded-museum",
      entrypoint: "https://vibecoded.games",
      title: "substitution",
    }],
    [
      { id: "vibecoded-museum", entrypoint: "https://vibecoded.games" },
      { id: "vibecoded-museum", entrypoint: "https://other.example" },
    ],
    [
      { id: "vibecoded-museum", entrypoint: "https://vibecoded.games" },
      { id: "other", entrypoint: "https://vibecoded.games" },
    ],
  ].entries()) {
    it(`rejects unsafe destination registry ${index + 1}`, () => {
      expect(() => new HostedBrowserPreviewController(input)).toThrow();
    });
  }

  it("rejects a request for an unregistered destination", () => {
    const controller = new HostedBrowserPreviewController(DESTINATIONS);
    expect(() => controller.prepare("unknown-game")).toThrow(
      "not allowlisted",
    );
  });
});
