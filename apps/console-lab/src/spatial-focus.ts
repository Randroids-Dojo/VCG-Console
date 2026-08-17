/**
 * Directional focus movement for controller input.
 *
 * Focus moves by where controls sit on screen, not by authored order, so a
 * press matches what the player sees. Controls are gathered into groups
 * (`data-focus-group`): a menu, a row of fixtures, a column of commands. A
 * press is then resolved in two stages:
 *
 * 1. Inside the player's current group, control by control.
 * 2. Only if nothing lies that way, into a neighbouring group, chosen by
 *    comparing whole group boxes rather than individual controls. Judging
 *    groups is what stops a press from leaping to a distant control that
 *    merely happens to lie in that direction. A full-width bar at the
 *    bottom of the screen is not "to the left" of a panel on the right.
 *
 * Where a crossing lands is fixed rather than geometric, so arriving in a
 * section is predictable:
 *
 * - A menu (`data-focus-group="menu"`) is entered at the entry it currently
 *   shows as chosen, so leaving a view's content returns to the place in the
 *   menu that view came from.
 * - Any other group is entered at its first control, so moving between
 *   stacked sections always arrives at the top of the next one.
 *
 * A control outside every group behaves as a group of one, so an unannotated
 * surface still navigates by plain geometry.
 */

export type FocusDirection = "left" | "up" | "right" | "down";

const MENU_GROUP = "menu";

export function focusGroupOf(control: HTMLElement): HTMLElement | undefined {
  return control.closest<HTMLElement>("[data-focus-group]") ?? undefined;
}

function isMenu(group: HTMLElement | undefined): boolean {
  return group?.dataset.focusGroup === MENU_GROUP;
}

/** The control a menu currently shows as chosen, if it marks one. */
function selectedEntry(members: HTMLElement[]): HTMLElement | undefined {
  return members.find(
    (member) =>
      member.classList.contains("active")
      || member.getAttribute("aria-selected") === "true"
      || member.getAttribute("aria-current") === "page",
  );
}

interface Candidate<T> {
  value: T;
  rect: DOMRect;
}

export function nearestControl(
  controls: HTMLElement[],
  active: HTMLElement,
  direction: FocusDirection,
): HTMLElement | undefined {
  const group = focusGroupOf(active);
  const origin = active.getBoundingClientRect();
  const others = controls.filter((control) => control !== active);

  const withinGroup = bestInDirection(
    others
      .filter((control) => focusGroupOf(control) === group)
      .map((control) => ({ value: control, rect: control.getBoundingClientRect() })),
    origin,
    direction,
  );
  if (withinGroup) return withinGroup;

  // Collect the neighbouring groups, keyed by the group element so each is
  // judged once by its own box. An ungrouped control keys to itself.
  const neighbours = new Map<HTMLElement, HTMLElement[]>();
  for (const control of others) {
    const owner = focusGroupOf(control);
    if (owner === group) continue;
    const key = owner ?? control;
    neighbours.set(key, [...(neighbours.get(key) ?? []), control]);
  }

  const entries = [...neighbours.keys()].map((key) => ({
    value: key,
    rect: key.getBoundingClientRect(),
  }));
  // A menu hands off to ordinary content in preference to another menu, so
  // Down leaves a top bar and Right leaves a side rail for the panel beside
  // it rather than skipping to the opposite menu.
  const contentFirst = isMenu(group)
    ? entries.filter((entry) => !isMenu(neighbourGroup(entry.value)))
    : entries;
  // A menu occupies a whole edge of the screen, so leaving one means "into
  // the content area" wherever that content sits; holding it to a quarter
  // turn would strand a bar whose panel is off to one side.
  const cone = isMenu(group) ? "any" : "quarter-turn";
  const target = bestInDirection(contentFirst, origin, direction, cone)
    ?? bestInDirection(entries, origin, direction, cone);
  if (!target) return undefined;

  const members = neighbours.get(target) ?? [];
  if (isMenu(neighbourGroup(target))) return selectedEntry(members) ?? members[0];
  return members[0];
}

/** A neighbour key is either the group element itself or a lone control. */
function neighbourGroup(key: HTMLElement): HTMLElement | undefined {
  return key.dataset.focusGroup === undefined ? focusGroupOf(key) : key;
}

function bestInDirection<T>(
  candidates: Candidate<T>[],
  origin: DOMRect,
  direction: FocusDirection,
  cone: "quarter-turn" | "any" = "quarter-turn",
): T | undefined {
  const horizontal = direction === "left" || direction === "right";
  const forward = direction === "right" || direction === "down";
  const originCross = horizontal
    ? (origin.top + origin.bottom) / 2
    : (origin.left + origin.right) / 2;
  let best: T | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const { value, rect } of candidates) {
    // A candidate must start beyond where the active control ends, so that
    // neighbours sharing a row are never treated as being below each other
    // when their edges differ by a pixel of rounding.
    const clears = horizontal
      ? (forward ? rect.left >= origin.right - 1 : rect.right <= origin.left + 1)
      : (forward ? rect.top >= origin.bottom - 1 : rect.bottom <= origin.top + 1);
    if (!clears) continue;
    // Travel along the pressed axis, measured leading-edge to leading-edge so
    // that neighbours of unequal size still order naturally.
    const advance = horizontal
      ? (forward ? rect.left - origin.left : origin.left - rect.left)
      : (forward ? rect.top - origin.top : origin.top - rect.top);
    const crossOverlap = horizontal
      ? Math.min(origin.bottom, rect.bottom) - Math.max(origin.top, rect.top)
      : Math.min(origin.right, rect.right) - Math.max(origin.left, rect.left);
    const crossDistance = Math.abs(
      (horizontal ? (rect.top + rect.bottom) / 2 : (rect.left + rect.right) / 2)
      - originCross,
    );
    // A candidate sharing the pressed axis band is always preferred; one that
    // does not is only a fallback, and only within a quarter turn of the
    // press, so a press never reads as travelling mostly sideways.
    if (cone === "quarter-turn" && crossOverlap <= 0 && crossDistance > advance) continue;
    const score = crossOverlap > 0
      ? advance + crossDistance / 8
      : 100_000 + advance + crossDistance;
    if (score < bestScore) {
      bestScore = score;
      best = value;
    }
  }
  return best;
}

/** Focuses a control and brings it into view without scrolling the page. */
export function focusControl(control: HTMLElement): void {
  control.focus();
  control.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/**
 * Scrolls the panel around a control when no control lies the pressed way.
 *
 * A panel can hold readable content past its last control: headings, the
 * metrics list, status copy. Focus alone can never reveal it, so pressing on
 * at the edge scrolls that content into view instead of doing nothing.
 *
 * Returns whether anything scrolled.
 */
export function scrollBeyondFocus(
  active: HTMLElement,
  direction: FocusDirection,
): boolean {
  const vertical = direction === "up" || direction === "down";
  const back = direction === "up" || direction === "left";
  for (
    let node: HTMLElement | null = active;
    node;
    node = node.parentElement
  ) {
    const remaining = vertical
      ? back
        ? node.scrollTop
        : node.scrollHeight - node.clientHeight - node.scrollTop
      : back
        ? node.scrollLeft
        : node.scrollWidth - node.clientWidth - node.scrollLeft;
    if (remaining <= 1) continue;
    const overflow = getComputedStyle(node)[vertical ? "overflowY" : "overflowX"];
    if (overflow !== "auto" && overflow !== "scroll") continue;
    // Just under a screenful, so the content that was at the edge stays on
    // screen as an anchor for where the panel moved to.
    const step = (vertical ? node.clientHeight : node.clientWidth) * 0.8;
    const distance = Math.min(step, remaining) * (back ? -1 : 1);
    node.scrollBy({
      ...(vertical ? { top: distance } : { left: distance }),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    return true;
  }
  return false;
}
