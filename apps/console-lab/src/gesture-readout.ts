import type { MotionAction } from "@vcg/motion-contract";
import { actionFeedback } from "./action-feedback";

const GESTURES: Record<MotionAction["name"], string> = {
  player_join: "Hands together",
  menu_select: "Hands together",
  menu_back: "Arms crossed",
  pause: "Arms crossed",
  menu_swipe_left: "Left hand out",
  menu_swipe_right: "Right hand out",
  menu_swipe_up: "Right hand at head",
  menu_swipe_down: "Left hand at head",
  jump: "Jump",
  duck: "Duck",
  dodge_left: "Dodge left",
  dodge_right: "Dodge right",
};

/** A short-lived live reading plus a persistent, explicitly labelled last result. */
export class GestureReadout {
  #current: { key: string; text: string; until: number; triggered: boolean } | undefined;
  #last = "No gesture completed yet.";

  observe(action: MotionAction, trackId: string, intent: string, nowMs: number): void {
    const gesture = GESTURES[action.name];
    const key = `${trackId}:${action.name}`;
    // A held/ended event follows a trigger immediately. Leave the recognition
    // visible instead of replacing it with "Hold 100%" on the next frame.
    if (action.phase !== "triggered" && this.#current?.key === key && this.#current.triggered) {
      if (action.phase === "ended" || action.phase === "cancelled") this.#current.triggered = false;
      else this.#current.until = nowMs + 1_500;
      return;
    }
    if (action.phase === "ended") return;
    const phase = action.phase === "triggered"
      ? "Seen"
      : action.phase === "cancelled"
        ? "Released too soon"
        : actionFeedback(action).phaseLabel;
    this.#current = { key, text: `${gesture} · ${phase}`, until: nowMs + 1_500, triggered: action.phase === "triggered" };
    if (action.phase === "triggered") this.#last = `${gesture} - ${intent}`;
    if (action.phase === "cancelled") this.#last = `${gesture} - released before the hold finished.`;
  }

  result(message: string): void {
    this.#last = message;
  }

  snapshot(nowMs: number): { current?: string; last: string } {
    return {
      ...(this.#current && nowMs <= this.#current.until ? { current: this.#current.text } : {}),
      last: this.#last,
    };
  }

  reset(): void {
    this.#current = undefined;
    this.#last = "No gesture completed yet.";
  }
}
