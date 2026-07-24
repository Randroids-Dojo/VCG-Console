import type { MotionAction } from "@vcg/motion-contract";
import {
  ACTION_HOLD_THRESHOLDS_MS,
  type SustainedActionName,
} from "./action-engine";

export type ActionFeedbackPhase =
  | "holding"
  | "accepted"
  | "cancelled"
  | "released";

export interface ActionFeedbackState {
  action: MotionAction["name"];
  actionLabel: string;
  phase: ActionFeedbackPhase;
  phaseLabel: string;
  detail: string;
  progress: number;
}

const ACTION_LABELS: Readonly<Record<MotionAction["name"], string>> = {
  player_join: "Join player",
  jump: "Jump",
  duck: "Duck",
  dodge_left: "Dodge left",
  dodge_right: "Dodge right",
  menu_swipe_left: "Move focus left",
  menu_swipe_right: "Move focus right",
  menu_select: "Select",
  menu_back: "Back",
  pause: "Pause",
};

export function actionFeedback(action: MotionAction): ActionFeedbackState {
  const actionLabel = ACTION_LABELS[action.name];
  const threshold = holdThreshold(action.name);
  if (action.phase === "started" || action.phase === "held") {
    const progress = threshold === undefined
      ? 0
      : Math.min(1, Math.max(0, (action.durationMs ?? 0) / threshold));
    return {
      action: action.name,
      actionLabel,
      phase: "holding",
      phaseLabel: `Hold ${Math.round(progress * 100)}%`,
      detail: `${actionLabel}: keep the gesture steady or release to cancel.`,
      progress,
    };
  }
  if (action.phase === "triggered") {
    return {
      action: action.name,
      actionLabel,
      phase: "accepted",
      phaseLabel: "Accepted",
      detail: threshold === undefined
        ? `${actionLabel} recognized.`
        : `${actionLabel} accepted; release before repeating it.`,
      progress: 1,
    };
  }
  if (action.phase === "cancelled") {
    return {
      action: action.name,
      actionLabel,
      phase: "cancelled",
      phaseLabel: "Cancelled",
      detail: `${actionLabel} cancelled before its hold completed.`,
      progress: 0,
    };
  }
  return {
    action: action.name,
    actionLabel,
    phase: "released",
    phaseLabel: "Released",
    detail: `${actionLabel} released and ready to rearm after cooldown.`,
    progress: 0,
  };
}

function holdThreshold(name: MotionAction["name"]): number | undefined {
  return ACTION_HOLD_THRESHOLDS_MS[name as SustainedActionName];
}
