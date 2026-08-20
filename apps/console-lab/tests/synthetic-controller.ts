import type { Page } from "@playwright/test";

/**
 * A controller the browser reports as connected before the page loads.
 *
 * The shell refuses to start a libretro game while no controller is
 * connected, so any test that drives one to the host needs a device present
 * from the first observation rather than after an event.
 */
export async function connectSyntheticController(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const gamepad = {
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      })),
      connected: true,
      hapticActuators: [],
      id: "Playwright launch controller",
      index: 0,
      mapping: "standard",
      timestamp: 0,
      vibrationActuator: null,
    } as unknown as Gamepad;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    });
  });
}
