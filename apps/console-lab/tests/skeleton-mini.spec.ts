import { expect, test } from "@playwright/test";

const TV = { width: 1920, height: 1080 } as const;

test("the corner skeleton stays empty until a camera fills it", async ({ page }) => {
  await page.setViewportSize(TV);
  await page.goto("/?skipBoot=1&input=controller&motionSimulatorTest=1");
  const mini = page.locator("#skeleton-mini");

  // Synthetic replay is producing a body, and the corner refuses to draw it:
  // a figure nobody in the room is moving would read as a working camera.
  await expect(mini).toBeHidden();

  // No camera is available here, so the placement contract is checked on the
  // element itself. It is the geometry a player sees whenever it is on. The
  // measurement stays inside one task because the render loop re-hides the
  // corner on its next frame.
  const box = await mini.evaluate((element: HTMLElement) => {
    element.hidden = false;
    const rect = element.getBoundingClientRect();
    element.hidden = true;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  expect(box.x + box.width).toBeLessThanOrEqual(TV.width * 0.95 + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(TV.height * 0.95 + 0.5);
  // Lower right, clear of the controller legend beneath it.
  expect(box.x).toBeGreaterThan(TV.width / 2);
  const legend = (await page.locator(".launcher-legend").boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(legend.y + 0.5);
});
