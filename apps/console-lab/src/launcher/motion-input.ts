import type { ConsoleInputAction } from "../gamepad-router";
import type { MotionAction } from "@vcg/motion-contract";

/**
 * Maps only triggered shell actions into the same bounded input vocabulary
 * used by a controller. Games never receive or override these console actions.
 */
export function launcherInputForMotionAction(
  action: Pick<MotionAction, "name" | "phase">,
): ConsoleInputAction | undefined {
  if (action.phase !== "triggered") return undefined;
  if (action.name === "menu_swipe_left") return "left";
  if (action.name === "menu_swipe_right") return "right";
  if (action.name === "menu_swipe_up") return "up";
  if (action.name === "menu_swipe_down") return "down";
  if (action.name === "menu_select") return "select";
  if (action.name === "menu_back") return "back";
  return undefined;
}
