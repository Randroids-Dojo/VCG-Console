import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startConsole } from "./motion-runtime";

vi.mock("./motion-runtime", () => ({ startConsole: vi.fn() }));

let events: EventTarget;
const dispose = vi.fn<() => Promise<void>>();

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  events = new EventTarget();
  vi.stubGlobal("window", events);
  vi.stubGlobal("document", { querySelector: () => ({}) });
  dispose.mockResolvedValue(undefined);
  vi.mocked(startConsole).mockReturnValue(dispose);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function transition(type: "pagehide" | "pageshow", persisted = true): void {
  const event = new Event(type);
  Object.defineProperty(event, "persisted", { value: persisted });
  events.dispatchEvent(event);
}

it("restores the console after a rejected teardown without an unhandled rejection", async () => {
  const error = new Error("tracker close failed");
  dispose.mockRejectedValueOnce(error);
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./main");
  transition("pagehide");
  transition("pageshow");
  await vi.waitFor(() => expect(startConsole).toHaveBeenCalledTimes(2));
  expect(report).toHaveBeenCalledWith("Console teardown failed", error);
  transition("pagehide");
  expect(dispose).toHaveBeenCalledTimes(2);
});

it("coalesces repeated events and does not restart while the page is hidden", async () => {
  let finish!: () => void;
  dispose.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  await import("./main");
  transition("pageshow", false);
  transition("pagehide");
  transition("pageshow");
  transition("pagehide");
  finish();
  await dispose.mock.results[0]!.value;
  await Promise.resolve();
  expect(startConsole).toHaveBeenCalledTimes(1);
  expect(dispose).toHaveBeenCalledTimes(1);
  transition("pageshow");
  transition("pageshow");
  await vi.waitFor(() => expect(startConsole).toHaveBeenCalledTimes(2));
});
