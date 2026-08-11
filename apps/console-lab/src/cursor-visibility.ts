// This is a controller- and body-camera-driven television console, not a
// mouse-driven desktop app. A visible pointer sitting idle on screen reads as
// broken, and the appliance boot path has no mouse to begin with -- but a
// mouse plugged in for desk development should still work normally while
// it's actually moving.
//
// Hidden by default and shown only while the pointer is actively used, this
// keeps the cursor invisible for the entire appliance/controller/camera
// session (no pointer activity ever fires) while staying convenient at a
// desk (move the mouse, it appears; stop, it fades after a short delay).

export const CURSOR_IDLE_HIDE_DELAY_MS = 3_000;
export const CURSOR_HIDDEN_CLASS = "vcg-cursor-hidden";

const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "mousemove", "mousedown"] as const;

export interface CursorVisibilityHandle {
  dispose(): void;
}

interface TimerWindow {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}

/**
 * Hides `target`'s cursor (via `CURSOR_HIDDEN_CLASS`) until real pointer
 * activity is observed, then keeps it visible until `delayMs` passes with no
 * further activity.
 */
export function installAutoHidingCursor(
  target: HTMLElement,
  delayMs: number = CURSOR_IDLE_HIDE_DELAY_MS,
  win: TimerWindow = globalThis,
  eventTarget: EventTarget = globalThis,
): CursorVisibilityHandle {
  let hideTimer: ReturnType<typeof win.setTimeout> | undefined;

  const hide = () => {
    hideTimer = undefined;
    target.classList.add(CURSOR_HIDDEN_CLASS);
  };

  const scheduleHide = () => {
    if (hideTimer !== undefined) win.clearTimeout(hideTimer);
    hideTimer = win.setTimeout(hide, delayMs);
  };

  const show = () => {
    target.classList.remove(CURSOR_HIDDEN_CLASS);
    scheduleHide();
  };

  for (const type of ACTIVITY_EVENTS) {
    eventTarget.addEventListener(type, show, { passive: true });
  }
  hide();

  return {
    dispose() {
      if (hideTimer !== undefined) win.clearTimeout(hideTimer);
      for (const type of ACTIVITY_EVENTS) {
        eventTarget.removeEventListener(type, show);
      }
    },
  };
}
