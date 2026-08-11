import { describe, expect, it, vi } from "vitest";
import { CURSOR_HIDDEN_CLASS, installAutoHidingCursor } from "./cursor-visibility";

function fakeTarget() {
  const classes = new Set<string>();
  return {
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
      contains: (name: string) => classes.has(name),
    },
  } as unknown as HTMLElement;
}

describe("installAutoHidingCursor", () => {
  it("starts hidden before any pointer activity", () => {
    const target = fakeTarget();
    installAutoHidingCursor(target, 3_000, globalThis, new EventTarget());

    expect(target.classList.contains(CURSOR_HIDDEN_CLASS)).toBe(true);
  });

  it("shows on pointer activity and hides again after the idle delay", () => {
    vi.useFakeTimers();
    const target = fakeTarget();
    const eventTarget = new EventTarget();
    installAutoHidingCursor(target, 3_000, globalThis, eventTarget);

    eventTarget.dispatchEvent(new Event("mousemove"));
    expect(target.classList.contains(CURSOR_HIDDEN_CLASS)).toBe(false);

    vi.advanceTimersByTime(2_999);
    expect(target.classList.contains(CURSOR_HIDDEN_CLASS)).toBe(false);

    vi.advanceTimersByTime(1);
    expect(target.classList.contains(CURSOR_HIDDEN_CLASS)).toBe(true);

    vi.useRealTimers();
  });

  it("resets the idle delay on repeated activity", () => {
    vi.useFakeTimers();
    const target = fakeTarget();
    const eventTarget = new EventTarget();
    installAutoHidingCursor(target, 3_000, globalThis, eventTarget);

    eventTarget.dispatchEvent(new Event("mousemove"));
    vi.advanceTimersByTime(2_000);
    eventTarget.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(2_000);

    expect(target.classList.contains(CURSOR_HIDDEN_CLASS)).toBe(false);

    vi.advanceTimersByTime(1_000);
    expect(target.classList.contains(CURSOR_HIDDEN_CLASS)).toBe(true);

    vi.useRealTimers();
  });

  it("dispose stops reacting to further activity and clears the pending timer", () => {
    vi.useFakeTimers();
    const target = fakeTarget();
    const eventTarget = new EventTarget();
    const handle = installAutoHidingCursor(target, 3_000, globalThis, eventTarget);

    eventTarget.dispatchEvent(new Event("mousemove"));
    expect(target.classList.contains(CURSOR_HIDDEN_CLASS)).toBe(false);

    handle.dispose();
    eventTarget.dispatchEvent(new Event("mousemove"));
    vi.advanceTimersByTime(10_000);

    // No listener remains to show it again, and the pending hide from the
    // first activity was cleared by dispose rather than firing later.
    expect(target.classList.contains(CURSOR_HIDDEN_CLASS)).toBe(false);

    vi.useRealTimers();
  });
});
