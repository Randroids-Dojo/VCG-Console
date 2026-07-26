import type { MotionAction, MotionProfile } from "./schema";

export const OBSTACLE_ACTION_NAMES = ["jump", "duck", "dodge_left", "dodge_right"] as const;
export const SHELL_ACTION_NAMES = [
  "player_join",
  "menu_swipe_left",
  "menu_swipe_right",
  "menu_select",
  "menu_back",
  "pause",
] as const;

export const MOTION_ACTION_PRIORITY = [
  "pause",
  "menu_back",
  "player_join",
  "menu_select",
  "menu_swipe_left",
  "menu_swipe_right",
  "jump",
  "duck",
  "dodge_left",
  "dodge_right",
] as const satisfies readonly MotionAction["name"][];

export const MOTION_ACTION_PHASE_PRIORITY = [
  "cancelled",
  "ended",
  "started",
  "held",
  "triggered",
] as const satisfies readonly MotionAction["phase"][];

const ACTION_PRIORITY = new Map<MotionAction["name"], number>(
  MOTION_ACTION_PRIORITY.map((name, index) => [name, index]),
);
const PHASE_PRIORITY = new Map<MotionAction["phase"], number>(
  MOTION_ACTION_PHASE_PRIORITY.map((phase, index) => [phase, index]),
);
const OBSTACLE_ACTION_SET = new Set<MotionAction["name"]>(OBSTACLE_ACTION_NAMES);
const SHELL_ACTION_SET = new Set<MotionAction["name"]>(SHELL_ACTION_NAMES);

export function actionBelongsToProfile(action: MotionAction["name"], profile: MotionProfile): boolean {
  if (profile === "actions.obstacle.v1") return OBSTACLE_ACTION_SET.has(action);
  if (profile === "actions.shell.v1") return SHELL_ACTION_SET.has(action);
  return false;
}

/**
 * Returns a new array in the normative within-frame action order.
 *
 * Closing lifecycle events precede new progress, progress precedes the only
 * side-effecting `triggered` phase, and privileged triggers precede game
 * triggers. Input order is the final tie-breaker through stable Array.sort.
 */
export function sortMotionActions(actions: readonly MotionAction[]): MotionAction[] {
  return [...actions].sort((left, right) => {
    const timestampOrder = left.occurredAtMs - right.occurredAtMs;
    if (timestampOrder !== 0) return timestampOrder;
    const phaseOrder =
      (PHASE_PRIORITY.get(left.phase) ?? Number.MAX_SAFE_INTEGER) -
      (PHASE_PRIORITY.get(right.phase) ?? Number.MAX_SAFE_INTEGER);
    if (phaseOrder !== 0) return phaseOrder;
    return (ACTION_PRIORITY.get(left.name) ?? Number.MAX_SAFE_INTEGER) -
      (ACTION_PRIORITY.get(right.name) ?? Number.MAX_SAFE_INTEGER);
  });
}
